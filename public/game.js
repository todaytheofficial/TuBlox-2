// ===================================
// 0. АВТОРИЗАЦИЯ
// ===================================
if (typeof checkAuthAndRedirect === 'function') {
    checkAuthAndRedirect(false); 
}

// ===================================
// 1. Инициализация и Сеть
// ===================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('id') || 'parkour-1';

const username = localStorage.getItem('tublox_username') || 'Гость';
const deviceId = localStorage.getItem('tublox_uid'); 

const socket = io({
    query: { gameId, username, uniqueUserId: deviceId }
});

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let otherPlayers = {}; 
let lastPos = { x: 0, y: 0 }; 
let isChatActive = false; // НОВОЕ: Переменная для блокировки игровых команд
let buildingMode = false; // НОВОЕ: Режим строительства
const buildStatusDisplay = document.getElementById('build-status');

// Данные уровня, которые будут получены с сервера
let levelData = []; 
let userBlocks = []; 

// ===================================
// 2. Логика Игры (Физика и Персонаж)
// ===================================

const keys = { right: false, left: false, up: false }; 

const player = { 
    x: 50, y: 200, w: 40, h: 60, vx: 0, vy: 0, grounded: false 
};

const gravity = 0.5;
const jumpForce = -13; 
let walkFrame = 0; 

const friction = 0.85; 
const acceleration = 1.5; 
const BLOCK_SIZE = 50; // Размер блока для строительства

// --- Функция переключения режима строительства ---
function toggleBuildingMode() {
    if (isChatActive) return; // Не переключаем, если печатаем
    buildingMode = !buildingMode;
    if (buildStatusDisplay) {
        buildStatusDisplay.style.backgroundColor = buildingMode ? 'var(--danger)' : 'rgba(0, 0, 0, 0.4)';
        buildStatusDisplay.innerText = buildingMode ? 'B: ON' : 'B';
    }
}


function update() {
    // === Движение ===
    if (keys.right) player.vx += acceleration;
    if (keys.left) player.vx -= acceleration;
    
    player.vx *= friction;
    
    const maxSpeed = 8;
    if (player.vx > maxSpeed) player.vx = maxSpeed;
    if (player.vx < -maxSpeed) player.vx = -maxSpeed;

    player.vy += gravity;
    if (keys.up && player.grounded) {
        player.vy = jumpForce;
        player.grounded = false;
    }

    // Обновляем Y
    player.y += player.vy; 
    
    // Объединяем статические и пользовательские блоки для коллизии
    const allBlocks = [...levelData, ...userBlocks]; 
    
    // === Коллизия по Y (ФИКС ТЕЛЕПОРТА) ===
    player.grounded = false; // Сброс состояния
    
    allBlocks.forEach(rect => {
        if (player.x < rect.x + rect.w &&
            player.x + player.w > rect.x &&
            player.y < rect.y + rect.h &&
            player.y + player.h > rect.y) {
            
            // 1. СТОЛКНОВЕНИЕ СВЕРХУ (Игрок падает)
            // Проверяем, была ли нижняя грань игрока выше верхней грани блока в прошлом кадре
            if (player.vy >= 0 && player.y + player.h - player.vy <= rect.y) {
                player.grounded = true;
                player.vy = 0;
                player.y = rect.y - player.h; // Фиксируем точно на поверхности
            } 
            
            // 2. СТОЛКНОВЕНИЕ СНИЗУ (Игрок бьется головой)
            else if (player.vy < 0) {
                player.vy = 0;
                player.y = rect.y + rect.h; // Фиксируем под поверхностью
            }
        }
    });

    // Обновляем X
    player.x += player.vx;

    // === Коллизия по X (Горизонтальная) ===
    allBlocks.forEach(rect => {
        if (player.x < rect.x + rect.w &&
            player.x + player.w > rect.x &&
            player.y < rect.y + player.h &&
            player.y + player.h > rect.y) {
            
            if (player.vx > 0) {
                player.x = rect.x - player.w; 
                player.vx = 0;
            }
            else if (player.vx < 0) {
                player.x = rect.x + rect.w; 
                player.vx = 0;
            }
        }
    });

    // Респаун (Если игрок падает ниже пола, который является первым элементом в levelData)
    if (levelData.length > 0 && player.y > levelData[0].y + 200) { 
        player.x = 50; player.y = 100; player.vx = 0; player.vy = 0;
    }
}


// ===================================
// 3. Рисование и Камера
// ===================================

function drawCharacter(ctx, x, y, w, h, vx, isGrounded, nickname, isLocal = false) {
    const centerX = x + w / 2;
    const isMoving = isGrounded && Math.abs(vx) > 0.5;
    
    let currentWalkFrame;
    if (isLocal) {
        if (isMoving) { walkFrame += 0.3; } 
        else if (isGrounded) { walkFrame = 0; }
        currentWalkFrame = walkFrame;
        
        // Рисуем рамку режима строительства
        if (buildingMode) {
            ctx.strokeStyle = 'var(--danger)';
            ctx.lineWidth = 4;
            ctx.strokeRect(x - 5, y - 15, w + 10, h + 20);
        }
    } else {
        currentWalkFrame = isMoving ? Date.now() / 100 : 0; 
    }
    
    const legOffset = isMoving ? Math.sin(currentWalkFrame) * 10 : 0; 
    
    ctx.save();
    
    // 1. НОГИ 
    ctx.fillStyle = '#111';
    const legH = h / 3; 
    ctx.fillRect(centerX - 10, y + h - legH, 10, legH + legOffset); 
    ctx.fillRect(centerX + 0, y + h - legH, 10, legH - legOffset);  

    // 2. ТЕЛО 
    ctx.fillStyle = isLocal ? '#5e81ac' : '#d08770'; 
    ctx.fillRect(centerX - 15, y + 10, 30, h - legH - 10); 

    // 3. ГОЛОВА 
    ctx.fillStyle = '#ffccaa'; 
    const headW = 24;
    ctx.fillRect(centerX - headW/2, y - 10, headW, headW); 

    // 4. ГЛАЗА
    ctx.fillStyle = '#111';
    ctx.fillRect(centerX - 8, y + 2, 4, 4); 
    ctx.fillRect(centerX + 4, y + 2, 4, 4); 


    // 5. РУКИ 
    ctx.fillStyle = '#ffccaa';
    const armOffset = isMoving ? -legOffset * 0.8 : 0;
    const armW = 10;
    const armH = h - legH - 10; 
    
    ctx.fillRect(centerX - 15 - armW, y + 10 + armOffset, armW, armH); 
    ctx.fillRect(centerX + 15, y + 10 - armOffset, armW, armH); 

    // 6. НИКНЕЙМ
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial'; 
    ctx.textAlign = 'center';
    ctx.fillText(nickname, centerX, y - 20); 

    ctx.restore();
}

function draw() {
    ctx.fillStyle = '#2e3440'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- ЛОГИКА КАМЕРЫ ---
    const camX = canvas.width / 2 - player.x;
    const camY = canvas.height / 2 - player.y; 

    ctx.save();
    ctx.translate(camX, camY); 
    // ----------------------

    // 1. Рисуем статический уровень
    ctx.fillStyle = '#a3be8c'; 
    levelData.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));

    // 2. Рисуем пользовательские блоки
    ctx.fillStyle = '#b48ead'; 
    userBlocks.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
    
    // 3. Рисуем ДРУГИХ игроков
    for (const id in otherPlayers) {
        const p = otherPlayers[id];
        drawCharacter(ctx, p.x, p.y, p.w || player.w, p.h || player.h, p.vx, p.grounded, p.username, false);
    }
    
    // 4. Рисуем СВОЕГО игрока
    drawCharacter(ctx, player.x, player.y, player.w, player.h, player.vx, player.grounded, username, true);

    ctx.restore(); 

    requestAnimationFrame(loop);
}

function loop() {
    update();
    
    // --- СЕТЕВАЯ СИНХРОНИЗАЦИЯ ---
    if (Math.abs(player.x - lastPos.x) > 1 || Math.abs(player.y - lastPos.y) > 1 || keys.up) {
        socket.emit('player-update', {
            x: player.x, y: player.y, w: player.w, h: player.h, vx: player.vx, grounded: player.grounded
        });
        lastPos.x = player.x;
        lastPos.y = player.y;
    }
    // ----------------------------

    draw();
}
loop(); 

// ===================================
// 4. Управление и Сетевые слушатели
// ===================================

document.getElementById('exit-game-btn').addEventListener('click', () => {
    socket.disconnect(); 
    window.location.href = 'dashboard.html'; 
});

// --- Получение данных уровня и блоков с сервера ---
socket.on('initial-game-data', (data) => {
    levelData = data.levelData;
    userBlocks = data.userBlocks;
});

// --- Обновление блоков от сервера ---
socket.on('update-blocks', (blocks) => {
    userBlocks = blocks;
});

socket.on('player-data', (players) => {
    otherPlayers = players;
    if (otherPlayers[socket.id]) {
        delete otherPlayers[socket.id];
    }
});

socket.on('player-disconnect', (playerId) => {
    if (otherPlayers[playerId]) {
        delete otherPlayers[playerId];
    }
});

// --- ФИКС ЧАТА И УПРАВЛЕНИЯ НА ПК ---
window.addEventListener('keydown', e => {
    if (isChatActive) return; 
    
    if(e.code === 'Space') e.preventDefault(); 
    
    if(e.code === 'KeyD' || e.key === 'ArrowRight') keys.right = true;
    if(e.code === 'KeyA' || e.key === 'ArrowLeft') keys.left = true;
    if(e.code === 'Space') keys.up = true;
    
    // Активация режима строительства по 'B'
    if(e.code === 'KeyB') toggleBuildingMode();
});

window.addEventListener('keyup', e => {
    if (isChatActive) return; 
    
    if(e.code === 'KeyD' || e.key === 'ArrowRight') keys.right = false;
    if(e.code === 'KeyA' || e.key === 'ArrowLeft') keys.left = false;
    if(e.code === 'Space') keys.up = false;
});


// ===================================
// 5. Чат, Джойстик и Билдинг
// ===================================

const chatInput = document.getElementById('chat-input');
const chatMsgs = document.getElementById('chat-messages');

// --- ФИКС ЧАТА (ПК) ---
if (chatInput) {
    chatInput.addEventListener('focus', () => {
        isChatActive = true;
        keys.right = false; keys.left = false;
    });

    chatInput.addEventListener('blur', () => {
        isChatActive = false;
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInput.value) {
            socket.emit('chat-message', chatInput.value); 
            chatInput.value = '';
            chatInput.blur(); 
        }
    });
}
// ... (логика socket.on('chat-message')) ...


// --- ЛОГИКА ДЖОЙСТИКА ---
const joystickArea = document.getElementById('joystick-area');
const joystickStick = document.getElementById('joystick-stick');
const btnJump = document.getElementById('btn-jump');

if (joystickArea && joystickStick) {
    const maxDistance = 50; 
    
    const updateMovementFromJoystick = (x) => {
        if (x > 10) { keys.right = true; keys.left = false;} 
        else if (x < -10) { keys.left = true; keys.right = false;} 
        else { keys.left = false; keys.right = false;}
    };
    
    const handleMove = (e) => {
        e.preventDefault();
        const touch = e.touches ? e.touches[0] : e;
        
        const rect = joystickArea.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        
        const dx = touch.clientX - center.x;
        const dy = touch.clientY - center.y;
        
        const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
        const angle = Math.atan2(dy, dx);
        
        const finalX = Math.cos(angle) * distance;
        const finalY = Math.sin(angle) * distance;
        
        joystickStick.style.transform = `translate(${finalX - 20}px, ${finalY - 20}px)`; 
        updateMovementFromJoystick(finalX);
    };

    const resetJoystick = () => {
        joystickStick.style.transform = `translate(-50%, -50%)`;
        keys.left = false;
        keys.right = false;
    };

    joystickArea.addEventListener('touchstart', handleMove, { passive: false });
    joystickArea.addEventListener('touchmove', handleMove, { passive: false });
    joystickArea.addEventListener('touchend', resetJoystick);
    
    // Поддержка мыши для тестирования
    joystickArea.addEventListener('mousedown', (e) => {
        e.preventDefault();
        joystickArea.isDragging = true;
        handleMove(e);
    });
    document.addEventListener('mousemove', (e) => {
        if (joystickArea.isDragging) handleMove(e);
    });
    document.addEventListener('mouseup', () => {
        if (joystickArea.isDragging) resetJoystick();
        joystickArea.isDragging = false;
    });
}

// Кнопка Прыжка
if (btnJump) {
    const activateJump = (e) => { e.preventDefault(); keys.up = true; };
    const deactivateJump = (e) => { e.preventDefault(); keys.up = false; };
    
    btnJump.addEventListener('touchstart', activateJump, { passive: false });
    btnJump.addEventListener('touchend', deactivateJump, { passive: false });
    btnJump.addEventListener('mousedown', activateJump); 
    btnJump.addEventListener('mouseup', deactivateJump);
}


// --- ЛОГИКА БИЛДИНГА ---
let lastTap = 0;
const TAP_TIMEOUT = 300; 

// Функция для обработки постройки/удаления
function handleBuilding(gameX, gameY, isRemoving = false) {
    if (!buildingMode) return; 

    const blockX = Math.floor(gameX / BLOCK_SIZE) * BLOCK_SIZE;
    const blockY = Math.floor(gameY / BLOCK_SIZE) * BLOCK_SIZE;
    
    // Проверка радиуса строительства (150px)
    const distance = Math.sqrt(
        Math.pow(blockX - player.x, 2) + Math.pow(blockY - player.y, 2)
    );
    if (distance > 300) return;

    const block = { x: blockX, y: blockY, w: BLOCK_SIZE, h: BLOCK_SIZE };
    const existingBlockIndex = userBlocks.findIndex(b => b.x === blockX && b.y === blockY);
    
    if (isRemoving) {
        if (existingBlockIndex !== -1) {
            socket.emit('remove-block', block); 
        }
    } else {
        if (existingBlockIndex === -1) {
            // Проверка, что блок не ставится в игрока
            if (!(blockX < player.x + player.w && blockX + block.w > player.x && blockY < player.y + player.h && blockY + block.h > player.y)) {
                socket.emit('add-block', block); 
            }
        }
    }
}


canvas.addEventListener('click', (e) => {
    // ПК: Shift + клик для удаления, клик для постройки
    if (buildingMode) {
        // Конвертация координат клика в игровые координаты
        const camX = canvas.width / 2 - player.x;
        const camY = canvas.height / 2 - player.y; 
        const gameX = e.clientX - camX;
        const gameY = e.clientY - camY;

        const isRemoving = e.shiftKey || e.button === 2; // Shift или Правая кнопка мыши
        handleBuilding(gameX, gameY, isRemoving);
    }
});

// Правый клик отключает контекстное меню
canvas.addEventListener('contextmenu', (e) => e.preventDefault());


// --- ЛОГИКА ДВОЙНОГО ТАПА (МОБИЛЬНЫЙ БИЛДИНГ) ---
canvas.addEventListener('touchend', (e) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTap;
    
    if (timeSinceLastTap < TAP_TIMEOUT && timeSinceLastTap > 0) {
        e.preventDefault(); 
        toggleBuildingMode();
    }
    
    // Если в режиме строительства и это не двойной тап для переключения
    if (buildingMode && timeSinceLastTap >= TAP_TIMEOUT) {
        const touch = e.changedTouches[0];
        const camX = canvas.width / 2 - player.x;
        const camY = canvas.height / 2 - player.y; 
        const gameX = touch.clientX - camX;
        const gameY = touch.clientY - camY;

        // Определяем, был ли тап на левой или правой стороне для постройки/удаления
        // Левая половина - удаление, Правая - постройка
        const isRemoving = touch.clientX < canvas.width / 2; 
        
        handleBuilding(gameX, gameY, isRemoving);
    }

    lastTap = now;
}, { passive: false });