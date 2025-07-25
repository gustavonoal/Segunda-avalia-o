if (typeof THREE === 'undefined' || typeof THREE.PointerLockControls === 'undefined') {
    console.error("Erro: Three.js ou PointerLockControls não carregados. O jogo não pode iniciar.");
    document.body.innerHTML = "<p style='color:red; text-align:center; margin-top:50px;'>Erro ao carregar o jogo. Por favor, verifique sua conexão ou tente novamente.</p>";
    throw new Error("Missing Three.js or PointerLockControls.");
}
console.log("PointerLockControls disponível:", !!THREE.PointerLockControls);

// Seleção de elementos HTML
const startScreen = document.getElementById('start-screen');
const gameContainer = document.getElementById('game-container');
const easyBtn = document.getElementById('easy-btn');
const mediumBtn = document.getElementById('medium-btn');
const hardBtn = document.getElementById('hard-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsModal = document.getElementById('controls-modal');
const closeModalBtn = document.querySelector('#controls-modal .close-button');
const victoryScreen = document.getElementById('victory');
const gameOverScreen = document.getElementById('game-over');
const restartVictoryBtn = document.getElementById('restart-victory-btn');
const restartGameoverBtn = document.getElementById('restart-gameover-btn');
const quitGameBtn = document.getElementById('quit-game-btn');
const finalTimeElem = document.getElementById('final-time');
const timerElem = document.getElementById("timer");

// NOVO: Seleção do elemento de feedback de colisão
const collisionFeedbackElem = document.getElementById('collision-feedback');

let scene, camera, renderer, controls, clock, startTime, victory = false, gameOver = false;
let maze = [];
let cellSize = 10;
let player = { x: 0, z: 0, radius: 2 };
let exit = { x: 0, z: 0, radius: 3 };
let npc = { x: 0, z: 0, radius: 2, speed: 3, mesh: null, path: [] };
const keys = {};
const difficultySettings = {
    easy: { mazeSize: 15, npcSpeed: 2.5, npcActive: false, playerStart: { x: 1.5, z: 1.5 }, exitPos: { x: 13.5, z: 13.5 } },
    medium: { mazeSize: 25, npcSpeed: 3.5, npcActive: true, playerStart: { x: 1.5, z: 1.5 }, exitPos: { x: 23.5, z: 23.5 } },
    hard: { mazeSize: 35, npcSpeed: 4.5, npcActive: true, playerStart: { x: 1.5, z: 1.5 }, exitPos: { x: 33.5, z: 33.5 } }
};
let currentDifficulty;
const walkSpeed = 5;
const runSpeed = 15;
const headBobbingAmount = 0.2;
const headBobbingSpeed = 8;
let totalTime = 0;

// Event Listeners
document.addEventListener("keydown", e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === "r") location.reload();
    if (e.key.toLowerCase() === "escape" && controls.isLocked) {
        controls.unlock();
    } else if (e.key.toLowerCase() === "escape" && !controls.isLocked && !victory && !gameOver) {
        if (controlsModal.style.display === 'flex') {
            controlsModal.style.display = 'none';
        } else {
             controls.lock();
        }
    }
});
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

easyBtn.addEventListener('click', () => startGame('easy'));
mediumBtn.addEventListener('click', () => startGame('medium'));
hardBtn.addEventListener('click', () => startGame('hard'));
restartVictoryBtn.addEventListener('click', () => restartGame());
restartGameoverBtn.addEventListener('click', () => restartGame());
quitGameBtn.addEventListener('click', () => window.location.reload());

controlsBtn.addEventListener('click', () => {
    controlsModal.style.display = 'flex';
});
closeModalBtn.addEventListener('click', () => {
    controlsModal.style.display = 'none';
});
window.addEventListener('click', (event) => {
    if (event.target === controlsModal) {
        controlsModal.style.display = 'none';
    }
});

function generateMaze(size) {
    let newMaze = Array(size).fill(0).map(() => Array(size).fill(1));
    let walls = [];
    let startX = 1 + Math.floor(Math.random() * ((size - 2) / 2)) * 2;
    let startY = 1 + Math.floor(Math.random() * ((size - 2) / 2)) * 2;
    newMaze[startY][startX] = 0;
    addWalls(startX, startY);

    function addWalls(x, y) {
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of directions) {
            const wallX = x + dx;
            const wallY = y + dy;
            const targetCellX = x + dx * 2;
            const targetCellY = y + dy * 2;

            if (wallX > 0 && wallX < size - 1 && wallY > 0 && wallY < size - 1 &&
                targetCellX > 0 && targetCellX < size - 1 && targetCellY > 0 && targetCellY < size - 1 &&
                newMaze[targetCellY][targetCellX] === 1) {
                let exists = walls.some(w => w.x === wallX && w.y === wallY);
                if (!exists) {
                    walls.push({ x: wallX, y: wallY, targetX: targetCellX, targetY: targetCellY });
                }
            }
        }
    }

    while (walls.length > 0) {
        const wallIndex = Math.floor(Math.random() * walls.length);
        const wall = walls.splice(wallIndex, 1)[0];
        const cellX = wall.x;
        const cellY = wall.y;
        const targetX = wall.targetX;
        const targetY = wall.targetY;

        if (newMaze[targetY][targetX] === 1) {
            newMaze[cellY][cellX] = 0;
            newMaze[targetY][targetX] = 0;
            addWalls(targetX, targetY);
        }
    }

    // Ensure start and exit are open
    newMaze[Math.floor(player.z)][Math.floor(player.x)] = 0;
    newMaze[Math.floor(exit.z)][Math.floor(exit.x)] = 0;
    // Ensure entry/exit points near borders are open if they become walls
    newMaze[1][0] = 0; // Example for a common entry point
    newMaze[size - 2][size - 1] = 0; // Example for a common exit point

    // Ensure border walls are solid
    for (let i = 0; i < size; i++) {
        newMaze[0][i] = 1;
        newMaze[size - 1][i] = 1;
        newMaze[i][0] = 1;
        newMaze[i][size - 1] = 1;
    }

    return newMaze;
}

function startGame(difficulty) {
    currentDifficulty = difficultySettings[difficulty];
    player.x = currentDifficulty.playerStart.x;
    player.z = currentDifficulty.playerStart.z;
    exit.x = currentDifficulty.exitPos.x;
    exit.z = currentDifficulty.exitPos.z;

    maze = generateMaze(currentDifficulty.mazeSize);

    if (currentDifficulty.npcActive) {
        let npcStartX, npcStartZ;
        do {
            npcStartX = Math.floor(Math.random() * (currentDifficulty.mazeSize - 2)) + 1;
            npcStartZ = Math.floor(Math.random() * (currentDifficulty.mazeSize - 2)) + 1;
        } while (maze[npcStartZ][npcStartX] === 1 ||
                 (Math.abs(npcStartX - player.x) < 8 && Math.abs(npcStartZ - player.z) < 8)); // Prevent NPC spawning too close to player
        
        npc.x = npcStartX + 0.5; // Center NPC in cell
        npc.z = npcStartZ + 0.5;
        npc.path = []; // Clear NPC path on new game
    }

    startScreen.style.display = 'none';
    gameContainer.style.display = 'block';
    init();
}

function init() {
    try {
        console.log("Iniciando cena Three.js...");
        scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x222222, 0, 120);
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        console.log("Renderizador e câmera configurados.");

        controls = new THREE.PointerLockControls(camera, document.body);
        scene.add(controls.getObject());
        camera.position.set(player.x * cellSize, cellSize / 2, player.z * cellSize);

        document.body.addEventListener('click', () => {
            if (!controls.isLocked && !victory && !gameOver && controlsModal.style.display !== 'flex') {
                controls.lock();
            }
        });
        console.log("Controles criados e câmera posicionada.");
        const ambient = new THREE.AmbientLight(0xcccccc);
        const light = new THREE.DirectionalLight(0xffffff, 0.7);
        light.position.set(1, 2, 1);
        scene.add(ambient, light);
        console.log("Luzes adicionadas.");
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('ceu.jpg', function(skyTexture) {
        scene.background = skyTexture;
            console.log("Céu adicionado com textura.");
        }, undefined, function(err) {
            console.error('Erro ao carregar a textura do céu. Usando cor sólida como fallback:', err);
            scene.background = new THREE.Color(0x77b5fe);
        });
        textureLoader.load('chao.jpg', function(floorTexture) {
            floorTexture.wrapS = THREE.RepeatWrapping;
            floorTexture.wrapT = THREE.RepeatWrapping;
            floorTexture.repeat.set(currentDifficulty.mazeSize / 4, currentDifficulty.mazeSize / 4); 
            
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(maze[0].length * cellSize, maze.length * cellSize),
                new THREE.MeshStandardMaterial({ map: floorTexture })
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.01;
            scene.add(floor);
            console.log("Chão criado com textura.");
        }, undefined, function(err) {
            console.error('Erro ao carregar a textura do chão. Usando cor sólida como fallback:', err);
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(maze[0].length * cellSize, maze.length * cellSize),
                new THREE.MeshLambertMaterial({ color: 0xaaaaa })
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.01;
            scene.add(floor);
            console.log("Chão criado com cor sólida devido a erro na textura.");
        });
        const wallGroup = new THREE.Group();
        textureLoader.load('parede.jpg', function(wallTexture) {
            wallTexture.wrapS = THREE.RepeatWrapping;
            wallTexture.wrapT = THREE.RepeatWrapping;
            wallTexture.repeat.set(1, 1); 
            const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture });
            for (let z = 0; z < maze.length; z++) {
                for (let x = 0; x < maze[z].length; x++) {
                    if (maze[z][x] === 1) {
                        const wall = new THREE.Mesh(
                            new THREE.BoxGeometry(cellSize, cellSize, cellSize),
                            wallMat
                        );
                        wall.position.set(x * cellSize + cellSize / 2, cellSize / 2, z * cellSize + cellSize / 2);
                        wallGroup.add(wall);
                    }
                }
            }
            scene.add(wallGroup);
            console.log(`Paredes adicionadas com textura: ${wallGroup.children.length}.`);
        }, undefined, function(err) {
            console.error('Erro ao carregar a textura das paredes. Usando cor sólida como fallback:', err);
            const wallMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
            for (let z = 0; z < maze.length; z++) {
                for (let x = 0; x < maze[z].length; x++) {
                    if (maze[z][x] === 1) {
                        const wall = new THREE.Mesh(
                            new THREE.BoxGeometry(cellSize, cellSize, cellSize),
                            wallMat
                        );
                        wall.position.set(x * cellSize + cellSize / 2, cellSize / 2, z * cellSize + cellSize / 2);
                        wallGroup.add(wall);
                    }
                }
            }
            scene.add(wallGroup);
            console.log(`Paredes adicionadas com cor sólida devido a erro na textura: ${wallGroup.children.length}.`);
        });

        const exitGridX = Math.floor(exit.x);
        const exitGridZ = Math.floor(exit.z);
        if (maze[exitGridZ][exitGridX] === 1) {
            maze[exitGridZ][exitGridX] = 0;
        }
        const exitLight = new THREE.PointLight(0x00ffff, 2, cellSize * 5);
        exitLight.position.set(exit.x * cellSize, cellSize, exit.z * cellSize);
        scene.add(exitLight);
        const ringGeometry = new THREE.TorusGeometry(cellSize * 0.7, cellSize * 0.1, 16, 100);
        const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
        const exitRing = new THREE.Mesh(ringGeometry, ringMaterial);
        exitRing.rotation.x = Math.PI / 2;
        exitRing.position.set(exit.x * cellSize, cellSize / 2, exit.z * cellSize);
        scene.add(exitRing);
        const particleCount = 500;
        const particles = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.8
        });
        for (let i = 0; i < particleCount; i++) {
            const x = (Math.random() - 0.5) * cellSize * 2;
            const y = Math.random() * cellSize;
            const z = (Math.random() - 0.5) * cellSize * 2;
            positions.push(exit.x * cellSize + x, y, exit.z * cellSize + z);
            colors.push(0.0, 1.0, 1.0);
        }
        particles.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const particleSystem = new THREE.Points(particles, particleMaterial);
        scene.add(particleSystem);
        exit.particleSystem = particleSystem;
        console.log("Saída do labirinto aprimorada com luz e portal.");

        if (currentDifficulty.npcActive) {
            const npcTextureLoader = new THREE.TextureLoader();
            npcTextureLoader.load(
                'img/superxando.jpg',
                function(texture) {
                    const npcGeometry = new THREE.PlaneGeometry(cellSize * 0.8, cellSize * 0.8);
                    const npcMaterial = new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: true,
                        side: THREE.DoubleSide
                    });
                    npc.mesh = new THREE.Mesh(npcGeometry, npcMaterial);
                    npc.mesh.position.set(npc.x * cellSize, cellSize * 0.4, npc.z * cellSize);
                    scene.add(npc.mesh);
                    const npcLight = new THREE.PointLight(0xff4500, 1, cellSize * 3);
                    npc.mesh.add(npcLight);
                    console.log("NPC inimigo adicionado com imagem do Super Xandão.");
                },
                undefined,
                function(err) {
                    console.error('Um erro ocorreu ao carregar a imagem do NPC:', err);
                    const npcGeometry = new THREE.ConeGeometry(cellSize * 0.4, cellSize * 0.8, 8);
                    const npcMaterial = new THREE.MeshBasicMaterial({ color: 0xff4500, wireframe: false });
                    npc.mesh = new THREE.Mesh(npcGeometry, npcMaterial);
                    npc.mesh.position.set(npc.x * cellSize, cellSize * 0.4, npc.z * cellSize);
                    scene.add(npc.mesh);
                    const npcLight = new THREE.PointLight(0xff4500, 1, cellSize * 3);
                    npc.mesh.add(npcLight);
                    console.log("NPC inimigo adicionado como cone devido a erro de carregamento da imagem.");
                }
            );
        }
        clock = new THREE.Clock();
        startTime = Date.now();
        animate();
        console.log("Loop de animação iniciado.");
    } catch (e) {
        console.error("Erro fatal durante a inicialização do jogo:", e);
        document.body.innerHTML = "<p style='color:red; text-align:center; margin-top:50px;'>Ocorreu um erro crítico. Por favor, tente novamente.</p>";
    }
}
class Node {
    constructor(x, y, g = 0, h = 0, parent = null) {
        this.x = x;
        this.y = y;
        this.g = g;
        this.h = h;
        this.f = g + h;
        this.parent = parent;
    }
}

function heuristic(nodeA, nodeB) {
    return Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y);
}

function findPathAStar(start, end, maze) {
    const startNode = new Node(Math.floor(start.x), Math.floor(start.y));
    const endNode = new Node(Math.floor(end.x), Math.floor(end.y));
    let openSet = [startNode];
    let closedSet = new Set();

    while (openSet.length > 0) {
        let currentNode = openSet[0];
        for (let i = 1; i < openSet.length; i++) {
            if (openSet[i].f < currentNode.f) {
                currentNode = openSet[i];
            }
        }
        openSet = openSet.filter(node => node !== currentNode);
        closedSet.add(`${currentNode.x},${currentNode.y}`);

        if (currentNode.x === endNode.x && currentNode.y === endNode.y) {
            let path = [];
            let temp = currentNode;
            while (temp) {
                path.push({ x: temp.x, z: temp.y }); // Use z for y-coordinate to match game's 3D axis
                temp = temp.parent;
            }
            return path.reverse();
        }
        const neighbors = [
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }
        ];

        for (const { dx, dy } of neighbors) {
            const neighborX = currentNode.x + dx;
            const neighborY = currentNode.y + dy;

            if (neighborX >= 0 && neighborX < maze[0].length &&
                neighborY >= 0 && neighborY < maze.length &&
                maze[neighborY][neighborX] === 0 && // Check if it's a passable cell
                !closedSet.has(`${neighborX},${neighborY}`))
            {
                const gScore = currentNode.g + 1; // Cost to move to neighbor (1 for adjacent)
                const hScore = heuristic({ x: neighborX, y: neighborY }, endNode);
                const neighborNode = new Node(neighborX, neighborY, gScore, hScore, currentNode);

                let inOpenSet = false;
                for (const node of openSet) {
                    if (node.x === neighborX && node.y === neighborY) {
                        inOpenSet = true;
                        if (gScore < node.g) { // If a better path to this neighbor is found
                            node.g = gScore;
                            node.f = gScore + node.h;
                            node.parent = currentNode;
                        }
                        break;
                    }
                }

                if (!inOpenSet) {
                    openSet.push(neighborNode);
                }
            }
        }
    }
    return []; // No path found
}

/**
 * Verifica e resolve colisões do jogador com as paredes do labirinto.
 *
 * @param {THREE.Vector3} currentPos A posição atual do jogador (objeto da câmera).
 * @param {THREE.Vector3} prevPos A posição anterior do jogador.
 * @param {number} delta O tempo decorrido desde o último frame.
 */
function checkPlayerCollision(currentPos, prevPos, delta) {
    const playerRadius = player.radius * 0.7; // Ajustado para 0.7 para uma folga maior
    const wallHalfSize = cellSize / 2;
    let collidedThisFrame = false; // Flag para saber se houve colisão

    const playerGridX = Math.floor(currentPos.x / cellSize);
    const playerGridZ = Math.floor(currentPos.z / cellSize);

    for (let zOffset = -1; zOffset <= 1; zOffset++) {
        for (let xOffset = -1; xOffset <= 1; xOffset++) {
            const checkGridX = playerGridX + xOffset;
            const checkGridZ = playerGridZ + zOffset;

            if (checkGridX < 0 || checkGridX >= maze[0].length ||
                checkGridZ < 0 || checkGridZ >= maze.length) {
                continue;
            }

            if (maze[checkGridZ][checkGridX] === 1) {
                const wallCenterX = checkGridX * cellSize + wallHalfSize;
                const wallCenterZ = checkGridZ * cellSize + wallHalfSize;

                let dx = currentPos.x - wallCenterX;
                let dz = currentPos.z - wallCenterZ;

                let clampedX = THREE.MathUtils.clamp(dx, -wallHalfSize, wallHalfSize);
                let clampedZ = THREE.MathUtils.clamp(dz, -wallHalfSize, wallHalfSize);

                let closestPointX = wallCenterX + clampedX;
                let closestPointZ = wallCenterZ + clampedZ;

                let distanceX = currentPos.x - closestPointX;
                let distanceZ = currentPos.z - closestPointZ;

                let distanceSquared = (distanceX * distanceX) + (distanceZ * distanceZ);

                if (distanceSquared < (playerRadius * playerRadius)) {
                    let distance = Math.sqrt(distanceSquared);
                    let penetrationDepth = playerRadius - distance;

                    if (penetrationDepth > 0) {
                        collidedThisFrame = true; // Marcar que houve colisão

                        let normalX = 0;
                        let normalZ = 0;

                        if (distance > 0) {
                            normalX = distanceX / distance;
                            normalZ = distanceZ / distance;
                        } else {
                            const moveDir = new THREE.Vector3().subVectors(currentPos, prevPos);
                            if (moveDir.lengthSq() > 0) {
                                moveDir.normalize();
                                normalX = moveDir.x;
                                normalZ = moveDir.z;
                            } else {
                                normalX = 1; // Fallback se não houver movimento
                            }
                        }

                        currentPos.x += normalX * penetrationDepth;
                        currentPos.z += normalZ * penetrationDepth;

                        const playerVelocityX = currentPos.x - prevPos.x;
                        const playerVelocityZ = currentPos.z - prevPos.z;

                        const dotProduct = playerVelocityX * normalX + playerVelocityZ * normalZ;

                        currentPos.x -= normalX * dotProduct;
                        currentPos.z -= normalZ * dotProduct;
                    }
                }
            }
        }
    }

    // Se houve colisão nesta frame, ativa o feedback visual
    if (collidedThisFrame) {
        collisionFeedbackElem.classList.add('active');
        // Remove a classe após a duração da animação para permitir que ela ocorra novamente
        setTimeout(() => {
            collisionFeedbackElem.classList.remove('active');
        }, 300); // 300ms = duração da animação collisionFlash
    }
}

function updateMovement(delta) {
    if (!controls || !controls.isLocked) return;

    let currentMoveSpeed = walkSpeed * delta;
    let isMoving = false;

    if (keys[" "]) { // Spacebar for running
        currentMoveSpeed = runSpeed * delta;
    }

    const prevPos = controls.getObject().position.clone();

    if (keys["w"] || keys["arrowup"]) { controls.moveForward(currentMoveSpeed); isMoving = true; }
    if (keys["s"] || keys["arrowdown"]) { controls.moveForward(-currentMoveSpeed); isMoving = true; }
    if (keys["a"] || keys["arrowleft"]) { controls.moveRight(-currentMoveSpeed); isMoving = true; }
    if (keys["d"] || keys["arrowright"]) { controls.moveRight(currentMoveSpeed); isMoving = true; }

    const currentPos = controls.getObject().position;

    player.x = currentPos.x / cellSize;
    player.z = currentPos.z / cellSize;

    checkPlayerCollision(currentPos, prevPos, delta);

    const originalCameraY = cellSize / 2;
    if (isMoving) {
        totalTime += delta * headBobbingSpeed;
        const bobAmount = Math.sin(totalTime) * headBobbingAmount;
        camera.position.y = originalCameraY + bobAmount;
    } else {
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, originalCameraY, 0.1);
    }
}

let pathUpdateInterval = 0.5; // How often NPC recalculates path
let timeSinceLastPathUpdate = 0;

function updateNPC(delta) {
    if (!currentDifficulty.npcActive || !npc.mesh || victory || gameOver) return;

    timeSinceLastPathUpdate += delta;

    const playerGrid = { x: Math.floor(player.x), y: Math.floor(player.z) };
    const npcGrid = { x: Math.floor(npc.x), y: Math.floor(npc.z) };

    // Recalculate path if enough time has passed, or if the path is empty,
    // or if the player has moved significantly from the path's target.
    if (timeSinceLastPathUpdate >= pathUpdateInterval || npc.path.length === 0 ||
        (npc.path.length > 0 && (npc.path[npc.path.length - 1].x !== playerGrid.x || npc.path[npc.path.length - 1].z !== playerGrid.y))) {
        
        // Handle cases where player or NPC might be in a wall (shouldn't happen with proper maze gen/collision)
        if (maze[playerGrid.y]?.[playerGrid.x] === 1) {
            npc.path = []; // Player is in a wall, NPC can't reach
            return;
        }
        if (maze[npcGrid.y]?.[npcGrid.x] === 1) {
            // If NPC somehow got into a wall, try to push it out to nearest open cell
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (maze[npcGrid.y + dz]?.[npcGrid.x + dx] === 0) {
                        npc.x = npcGrid.x + dx + 0.5;
                        npc.z = npcGrid.z + dz + 0.5;
                        npc.mesh.position.set(npc.x * cellSize, npc.mesh.position.y, npc.z * cellSize);
                        break;
                    }
                }
            }
            npc.path = []; // Clear path as position changed unexpectedly
            return;
        }

        npc.path = findPathAStar(npcGrid, playerGrid, maze);
        // Remove the first waypoint if it's the current NPC position (avoids getting stuck)
        if (npc.path.length > 0 && npc.path[0].x === npcGrid.x && npc.path[0].z === npcGrid.y) {
            npc.path.shift();
        }
        timeSinceLastPathUpdate = 0; // Reset timer
    }

    if (npc.path.length > 0) {
        const nextWaypoint = npc.path[0];
        const targetX = nextWaypoint.x * cellSize + cellSize / 2;
        const targetZ = nextWaypoint.z * cellSize + cellSize / 2;

        const currentNpcPos = npc.mesh.position;
        const direction = new THREE.Vector3().subVectors(new THREE.Vector3(targetX, currentNpcPos.y, targetZ), currentNpcPos).normalize();
        const moveAmount = currentDifficulty.npcSpeed * delta;

        const distToWaypoint = currentNpcPos.distanceTo(new THREE.Vector3(targetX, currentNpcPos.y, targetZ));

        // If very close to waypoint, snap to it and move to next
        if (distToWaypoint <= moveAmount + 0.1) {
            currentNpcPos.set(targetX, currentNpcPos.y, targetZ);
            npc.path.shift(); // Move to the next waypoint
        } else {
            currentNpcPos.add(direction.multiplyScalar(moveAmount));
        }

        npc.x = currentNpcPos.x / cellSize;
        npc.z = currentNpcPos.z / cellSize;
    }

    // Check for collision between NPC and Player
    const distSq = npc.mesh.position.distanceToSquared(controls.getObject().position);
    // Combined radius for collision detection (can be adjusted)
    const combinedRadius = (player.radius + npc.radius) * 0.7; // Use 0.7 for consistency or adjust
    const combinedRadiusSq = combinedRadius * combinedRadius;

    if (distSq < combinedRadiusSq) {
        endGame(true); // Player caught by NPC, game over!
    }
}

function checkVictory() {
    const playerToExitDist = new THREE.Vector3(player.x * cellSize, 0, player.z * cellSize).distanceTo(
        new THREE.Vector3(exit.x * cellSize, 0, exit.z * cellSize)
    );
    // Adjusted victory condition to be slightly larger than cell center to player radius
    if (!victory && playerToExitDist < (cellSize / 2 + player.radius) * 0.8) { 
        endGame(false); // Player reached exit, victory!
    }
}

function endGame(isGameOver) {
    if (victory || gameOver) return; // Prevent multiple calls

    controls.unlock(); // Unlock pointer controls

    if (isGameOver) {
        gameOver = true;
        gameOverScreen.style.display = 'flex';
        console.log("Game Over!");
        // NOVO: Ativa o feedback visual de Game Over
        collisionFeedbackElem.classList.add('game-over-flash');
    } else {
        victory = true;
        victoryScreen.style.display = 'flex';
        const finalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        finalTimeElem.textContent = finalTime;
        console.log(`Você venceu em ${finalTime}s!`);
    }
}

function restartGame() {
    victoryScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    gameContainer.style.display = 'none';
    startScreen.style.display = 'flex'; // Show start screen again

    victory = false;
    gameOver = false;
    totalTime = 0;
    npc.path = []; // Clear NPC path

    // NOVO: Remove as classes de feedback visual
    collisionFeedbackElem.classList.remove('active', 'game-over-flash');

    // Clean up Three.js scene and renderer to prevent memory leaks
    if (scene) {
        while(scene.children.length > 0){
            const obj = scene.children[0];
            scene.remove(obj);
            // Dispose geometries, materials, and textures to free up GPU memory
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        }
    }
    if (renderer && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    // Renderer needs to be re-initialized for new game, done by init() in startGame
}

function drawMinimap() {
    const minimapCanvas = document.getElementById("minimap");
    if (!minimapCanvas) {
        console.warn("Minimap canvas not found.");
        return;
    }
    const ctx = minimapCanvas.getContext("2d");
    if (!ctx) {
        console.warn("Could not get 2D context for minimap canvas.");
        return;
    }

    const mapSize = maze.length;
    minimapCanvas.width = 120; // Fixed size for minimap
    minimapCanvas.height = 120;
    ctx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    const scale = minimapCanvas.width / mapSize; // Scale cells to fit minimap

    // Draw maze walls and paths
    for (let z = 0; z < mapSize; z++) {
        for (let x = 0; x < mapSize; x++) {
            ctx.fillStyle = maze[z][x] === 1 ? "#333" : "#000"; // Walls are dark gray, paths are black
            ctx.fillRect(x * scale, z * scale, scale, scale);
        }
    }

    // Draw player
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.arc(player.x * scale, player.z * scale, 4, 0, Math.PI * 2); // Player as a red dot
    ctx.fill();

    // Draw exit
    ctx.fillStyle = "cyan";
    ctx.beginPath();
    ctx.arc(exit.x * scale, exit.z * scale, 4, 0, Math.PI * 2); // Exit as a cyan dot
    ctx.fill();

    // Draw NPC (if active)
    if (currentDifficulty.npcActive && npc.mesh) {
        ctx.fillStyle = "orange";
        ctx.beginPath();
        ctx.arc(npc.x * scale, npc.z * scale, 4, 0, Math.PI * 2); // NPC as an orange dot
        ctx.fill();

        // Draw NPC path (optional, can be performance intensive for large paths)
        if (npc.path.length > 0) {
            ctx.strokeStyle = "rgba(255, 255, 0, 0.5)"; // Yellow semi-transparent path
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(npc.x * scale, npc.z * scale); // Start from NPC's current position
            for (let i = 0; i < npc.path.length; i++) {
                // Add half 'scale' to center the path line in the cell
                ctx.lineTo(npc.path[i].x * scale + scale / 2, npc.path[i].z * scale + scale / 2);
            }
            ctx.stroke();
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta(); // Get time elapsed since last frame

    if (!victory && !gameOver) {
        updateMovement(delta);

        if (currentDifficulty.npcActive) {
            updateNPC(delta);
            // Make NPC mesh always face the camera (billboard effect)
            if (npc.mesh && camera) {
                const directionToCamera = new THREE.Vector3().subVectors(camera.position, npc.mesh.position);
                directionToCamera.y = 0; // Keep it on the XZ plane
                directionToCamera.normalize();
                npc.mesh.rotation.y = Math.atan2(directionToCamera.x, directionToCamera.z);
            }
        }

        // Animate exit particles
        if (exit.particleSystem) {
            exit.particleSystem.rotation.y += 0.01;
        }

        drawMinimap(); // Update minimap
        checkVictory(); // Check for victory condition

        // Update timer
        const t = ((Date.now() - startTime) / 1000).toFixed(1);
        timerElem.textContent = t;
    }

    renderer.render(scene, camera); // Render the scene
}

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});