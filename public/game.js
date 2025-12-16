// game.js

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('id');
const username = localStorage.getItem('tublox_username') || 'Игрок';

const socket = io({ query: { gameId, username } });

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- СОСТОЯНИЕ ИГРЫ ---
let isLoaded = false; 
let otherPlayers = {}; 
let levelData = []; 
let userBlocks = []; 
let isChatActive = false;
let currentSpawn = { x: 100, y: 100 }; // Динамический спавн
let isFinished = false; // Флаг для блокировки игры после завершения

// Хранилище для визуальных сообщений чата
const chatMessages = {}; 

const keys = { right: false, left: false, up: false }; 
const player = { 
    x: 100, y: 100, w: 30, h: 60, 
    vx: 0, vy: 0, 
    grounded: false,
    isDancing: false,
    color: '#81a1c1',
    // Счетчики анимации для локального игрока
    walkAnim: 0, 
    danceAnim: 0
};

const gravity = 0.6;
const jumpForce = -13;

// --- СБРОС ИГРОКА (Respawn) ---
function respawn() {
    player.x = currentSpawn.x;
    player.y = currentSpawn.y - player.h;
    player.vx = 0;
    player.vy = 0;
}

// --- ОТРИСОВКА ПЕРСОНАЖА ---
function drawHuman(p) {
    const centerX = p.x + 15;
    const isMoving = Math.abs(p.vx) > 0.5 && p.grounded;
    
    // Обновление счетчиков анимации
    if (isMoving) p.walkAnim += 0.2;
    else p.walkAnim = 0;

    if (p.isDancing) p.danceAnim += 0.15;
    else p.danceAnim = 0;

    ctx.save();
    
    // Никнейм
    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.fillText(p.username, centerX, p.y - 25);
    ctx.shadowBlur = 0;

    // 💬 ВИЗУАЛЬНЫЙ ЧАТ
    if (chatMessages[p.id] && chatMessages[p.id].display) {
        const msg = chatMessages[p.id].text;
        // Фон сообщения
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        const textMetrics = ctx.measureText(msg);
        const boxWidth = textMetrics.width + 15;
        ctx.fillRect(centerX - boxWidth / 2, p.y - 52, boxWidth, 22);
        
        // Текст сообщения
        ctx.fillStyle = "white";
        ctx.fillText(msg, centerX, p.y - 37);
    }
    
    // --- РАСЧЕТ КОНЕЧНОСТЕЙ ---
    let legL_Y = 45, legR_Y = 45;
    let armL_X = -18, armL_Y = 18;
    let armR_X = 12, armR_Y = 18;
    let bodyOffY = 0;

    if (p.isDancing) {
        bodyOffY = Math.sin(p.danceAnim * 2) * 3;
        legL_Y += Math.sin(p.danceAnim * 4) * 8;
        legR_Y += Math.cos(p.danceAnim * 4) * 8;
        armL_X = -18 - Math.sin(p.danceAnim * 3) * 15;
        armL_Y = 18 + Math.cos(p.danceAnim * 3) * 10;
        armR_X = 12 + Math.sin(p.danceAnim * 3) * 15;
        armR_Y = 18 - Math.cos(p.danceAnim * 3) * 10;
    } else if (isMoving) {
        const move = Math.sin(p.walkAnim) * 12;
        legL_Y += move;
        legR_Y -= move;
        armL_Y += move;
        armR_Y -= move;
    }

    // НОГИ
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(centerX - 11, p.y + legL_Y, 9, 15);
    ctx.fillRect(centerX + 2, p.y + legR_Y, 9, 15);

    // ТЕЛО
    ctx.fillStyle = p.color || '#81a1c1';
    ctx.fillRect(centerX - 12, p.y + 15 + bodyOffY, 24, 30);

    // РУКИ
    ctx.fillStyle = "#ffccaa";
    ctx.fillRect(centerX + armL_X, p.y + armL_Y + bodyOffY, 8, 18);
    ctx.fillRect(centerX + armR_X, p.y + armR_Y + bodyOffY, 8, 18);

    // ГОЛОВА
    ctx.fillStyle = "#ffccaa";
    ctx.fillRect(centerX - 10, p.y - 5 + bodyOffY, 20, 20);
    
    // ГЛАЗА
    ctx.fillStyle = "black";
    let look = p.vx >= 0 ? 3 : -7;
    ctx.fillRect(centerX + look, p.y + 2 + bodyOffY, 4, 4);
    ctx.fillRect(centerX + look + 5, p.y + 2 + bodyOffY, 4, 4);

    ctx.restore();
}

// --- УПРАВЛЕНИЕ ---
function stopDancing() {
    if (player.isDancing) {
        player.isDancing = false;
    }
}

window.addEventListener('keydown', e => {
    if (isChatActive || isFinished) return;
    const moveCodes = ['KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft', 'KeyW', 'ArrowUp', 'Space'];
    if (moveCodes.includes(e.code)) stopDancing();

    if (['KeyD', 'ArrowRight'].includes(e.code)) keys.right = true;
    if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.left = true;
    if (['KeyW', 'ArrowUp', 'Space'].includes(e.code)) keys.up = true;
});

window.addEventListener('keyup', e => {
    if (isChatActive || isFinished) return;
    if (['KeyD', 'ArrowRight'].includes(e.code)) keys.right = false;
    if (['KeyA', 'ArrowLeft'].includes(e.code)) keys.left = false;
    if (['KeyW', 'ArrowUp', 'Space'].includes(e.code)) keys.up = false;
});


// --- ФИЗИКА И ЛОГИКА БЛОКОВ ---
function isColliding(p, r) {
    return p.x < r.x + r.w && p.x + p.w > r.x &&
           p.y < r.y + r.h && p.y + p.h > r.y;
}

function handleTriggers(p, level) {
    if (isFinished) return; 

    for (let rect of level) {
        if (isColliding(p, rect)) {
            switch (rect.type) {
                case 'checkpoint':
                    if (!currentSpawn.id || rect.id !== currentSpawn.id) {
                        currentSpawn = { x: rect.x, y: rect.y, id: rect.id };
                    }
                    break;
                case 'kill':
                    respawn();
                    break;
                case 'finish':
                    // ** ИСПРАВЛЕННАЯ ЛОГИКА FINISH BLOCK **
                    if (!isFinished) {
                        isFinished = true;
                        
                        const finishModal = document.getElementById('finish-modal');
                        if (finishModal) {
                            finishModal.style.display = 'block';
                        }
                        
                        // Останавливаем игрока
                        keys.right = keys.left = keys.up = false;
                        player.vx = player.vy = 0;
                        console.log('--- LEVEL FINISHED! Showing menu. ---');
                    }
                    break;
            }
        }
    }
}

function update() {
    if (!isLoaded || isFinished) return; 

    // Логика движения
    if (keys.right) player.vx += 0.8;
    if (keys.left) player.vx -= 0.8;
    
    player.vx *= 0.85; 
    player.vy += gravity;

    if (keys.up && player.grounded) {
        player.vy = jumpForce;
        player.grounded = false;
    }

    // Бездна
    if (player.y > 2000) {
        respawn();
        return;
    }

    // Обработка триггеров (Checkpoint, Kill, Finish)
    handleTriggers(player, [...levelData, ...userBlocks]);
    
    // Фильтруем объекты, с которыми есть коллизия (collision: true)
    const solidObstacles = [...levelData, ...userBlocks].filter(b => b.collision === true && b.type !== 'spawn');

    // Коллизия по Y
    player.y += player.vy;
    player.grounded = false;
    for (let rect of solidObstacles) {
        if (isColliding(player, rect)) {
            if (player.vy > 0) { player.y = rect.y - player.h; player.vy = 0; player.grounded = true; }
            else if (player.vy < 0) { player.y = rect.y + rect.h; player.vy = 0; }
        }
    }

    // Коллизия по X
    player.x += player.vx;
    for (let rect of solidObstacles) {
        if (isColliding(player, rect)) {
            if (player.vx > 0) player.x = rect.x - player.w;
            else if (player.vx < 0) player.x = rect.x + rect.w;
            player.vx = 0;
        }
    }

    socket.emit('player-update', { 
        x: player.x, y: player.y, vx: player.vx, 
        grounded: player.grounded, isDancing: player.isDancing 
    });
}

// --- ОТРИСОВКА ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const camX = canvas.width / 2 - player.x;
    const camY = canvas.height / 2 - player.y;

    ctx.save();
    ctx.translate(camX, camY);

    // Уровень и блоки пользователя
    [...levelData, ...userBlocks].forEach(r => {
        if (r.type !== 'spawn') {
            ctx.globalAlpha = r.opacity || 1;
            ctx.fillStyle = r.color || '#4c566a';
            ctx.fillRect(r.x, r.y, r.w, r.h);
        }
    });
    
    ctx.globalAlpha = 1; 

    // Игроки
    for (let id in otherPlayers) {
        let p = otherPlayers[id];
        // Добавляем недостающие свойства для корректной отрисовки
        if (!p.id) p.id = id; 
        if (!p.walkAnim) p.walkAnim = 0;
        if (!p.danceAnim) p.danceAnim = 0;
        p.username = p.username || 'Гость';
        p.color = '#d08770'; 
        
        drawHuman(p);
    }
    
    // Отрисовка текущего игрока
    player.id = socket.id;
    player.username = username;
    drawHuman(player);

    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// --- ЧАТ И СОКЕТЫ ---
const chatInput = document.getElementById('chat-input');
if (chatInput) {
    chatInput.addEventListener('focus', () => isChatActive = true);
    chatInput.addEventListener('blur', () => isChatActive = false);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            const val = chatInput.value.trim();
            if (val === '/dance') {
                player.isDancing = true;
            } else {
                socket.emit('chat-message', val); 
            }
            chatInput.value = '';
            chatInput.blur();
        }
    });
}

socket.on('chat-message', d => {
    // 1. Логика для бокового чата
    const m = document.createElement('div');
    m.className = 'chat-msg';
    m.innerHTML = `<b>${d.user}:</b> ${d.text}`;
    const box = document.getElementById('chat-messages');
    if (box) { box.appendChild(m); box.scrollTop = box.scrollHeight; }
    
    // 2. Логика для визуального чата над головой
    chatMessages[d.id] = { 
        text: d.text,
        display: true 
    };

    // Сообщение пропадает через 4 секунды
    setTimeout(() => {
        if (chatMessages[d.id]) {
            chatMessages[d.id].display = false;
        }
    }, 4000);
});

socket.on('initial-game-data', d => { 
    levelData = d.levelData; 
    userBlocks = d.userBlocks; 
    
    const initialSpawnBlock = levelData.find(b => b.type === 'spawn');
    if (initialSpawnBlock) { 
        currentSpawn = { x: initialSpawnBlock.x, y: initialSpawnBlock.y, id: initialSpawnBlock.id };
    }
    
    respawn();
    isLoaded = true; 
});

socket.on('player-data', p => { 
    // При получении данных, сохраняем существующие счетчики анимации
    for (let id in p) {
        if (otherPlayers[id]) {
            p[id].walkAnim = otherPlayers[id].walkAnim;
            p[id].danceAnim = otherPlayers[id].danceAnim;
            p[id].id = id;
        } else {
            // Если игрок новый, инициализируем счетчики
            p[id].walkAnim = 0;
            p[id].danceAnim = 0;
            p[id].id = id;
        }
    }
    
    otherPlayers = p; 
    delete otherPlayers[socket.id]; 
});

socket.on('player-disconnect', id => delete otherPlayers[id]);

loop();