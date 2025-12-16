// ===================================
// 0. АВТОРИЗАЦИЯ
// ===================================
if (typeof checkAuthAndRedirect === 'function') {
    // Эта функция должна быть определена в auth.js
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

// ===================================
// 2. Логика Игры (Физика и Персонаж)
// ===================================

const keys = { right: false, left: false, up: false }; 

const player = { 
    x: 50, 
    y: 200, 
    w: 40, // УВЕЛИЧЕННЫЙ РАЗМЕР
    h: 60, // УВЕЛИЧЕННЫЙ РАЗМЕР
    vx: 0, 
    vy: 0, 
    grounded: false 
};

const gravity = 0.5;
const jumpForce = -13; 
let walkFrame = 0; 

const friction = 0.85; 
const acceleration = 1.5; 

// УВЕЛИЧЕННАЯ КАРТА (PARKOUR)
const levelData = [
    // Увеличенный пол (самая нижняя платформа)
    { x: 0, y: 500, w: 3000, h: 50 },    
    
    // Начальные платформы (масштабируем и разносим)
    { x: 300, y: 400, w: 150, h: 20 }, 
    { x: 550, y: 350, w: 100, h: 20 }, 
    { x: 700, y: 280, w: 180, h: 20 }, 

    // Дополнительные сложные участки
    { x: 1000, y: 200, w: 80, h: 20 },   
    { x: 1200, y: 150, w: 80, h: 20 },
    { x: 1400, y: 100, w: 80, h: 20 }, 
    
    // Длинный переход
    { x: 1700, y: 300, w: 400, h: 20 }
];

function update() {
    // === Движение ===
    if (keys.right) player.vx += acceleration;
    if (keys.left) player.vx -= acceleration;
    
    player.vx *= friction;
    
    const maxSpeed = 8;
    if (player.vx > maxSpeed) player.vx = maxSpeed;
    if (player.vx < -maxSpeed) player.vx = -maxSpeed;

    // Гравитация и Прыжок
    player.vy += gravity;
    if (keys.up && player.grounded) {
        player.vy = jumpForce;
        player.grounded = false;
    }

    // Обновляем Y
    player.y += player.vy; 
    
    // === Коллизия по Y (ФИКС ТЕЛЕПОРТА) ===
    let wasGrounded = player.grounded;
    player.grounded = false;
    
    levelData.forEach(rect => {
        if (player.x < rect.x + rect.w &&
            player.x + player.w > rect.x &&
            player.y < rect.y + rect.h &&
            player.y + player.h > rect.y) {
            
            // 1. СТОЛКНОВЕНИЕ СВЕРХУ (Игрок падает)
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
    levelData.forEach(rect => {
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

    // Респаун (Если игрок падает ниже пола)
    if (player.y > levelData[0].y + 200) { 
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
        if (isMoving) {
            walkFrame += 0.3; 
        } else if (isGrounded) {
            walkFrame = 0;
        }
        currentWalkFrame = walkFrame;
    } else {
        currentWalkFrame = isMoving ? Date.now() / 100 : 0; 
    }
    
    const legOffset = isMoving ? Math.sin(currentWalkFrame) * 10 : 0; 
    
    ctx.save();
    
    // 1. НОГИ (Штаны)
    ctx.fillStyle = '#111';
    const legH = h / 3; 
    ctx.fillRect(centerX - 10, y + h - legH, 10, legH + legOffset); 
    ctx.fillRect(centerX + 0, y + h - legH, 10, legH - legOffset);  

    // 2. ТЕЛО (Футболка)
    ctx.fillStyle = isLocal ? '#5e81ac' : '#d08770'; 
    ctx.fillRect(centerX - 15, y + 10, 30, h - legH - 10); 

    // 3. ГОЛОВА (Кожа)
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

    // 2. Рисуем уровень
    ctx.fillStyle = '#a3be8c'; 
    levelData.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));

    // 3. Рисуем ДРУГИХ игроков
    for (const id in otherPlayers) {
        const p = otherPlayers[id];
        // Используем переданные размеры p.w и p.h
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
            x: player.x,
            y: player.y,
            w: player.w, // Отправляем размер
            h: player.h, // Отправляем размер
            vx: player.vx,
            grounded: player.grounded
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

window.addEventListener('keydown', e => {
    if(e.code === 'Space') e.preventDefault(); 
    
    if(e.code === 'KeyD' || e.key === 'ArrowRight') keys.right = true;
    if(e.code === 'KeyA' || e.key === 'ArrowLeft') keys.left = true;
    if(e.code === 'Space') keys.up = true;
});

window.addEventListener('keyup', e => {
    if(e.code === 'KeyD' || e.key === 'ArrowRight') keys.right = false;
    if(e.code === 'KeyA' || e.key === 'ArrowLeft') keys.left = false;
    if(e.code === 'Space') keys.up = false;
});

// Мобильные кнопки
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');

const addTouch = (elem, key) => {
    const startHandler = (e) => { e.preventDefault(); keys[key] = true; };
    const endHandler = (e) => { e.preventDefault(); keys[key] = false; };
    
    if (elem) {
        elem.addEventListener('touchstart', startHandler);
        elem.addEventListener('touchend', endHandler);
        elem.addEventListener('mousedown', startHandler); 
        elem.addEventListener('mouseup', endHandler);
    }
};

addTouch(btnLeft, 'left');
addTouch(btnRight, 'right');
addTouch(btnJump, 'up');


// ===================================
// 5. Чат и Socket.io
// ===================================
const chatInput = document.getElementById('chat-input');
const chatMsgs = document.getElementById('chat-messages');

if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInput.value) {
            socket.emit('chat-message', chatInput.value); 
            chatInput.value = '';
        }
    });
}

socket.on('chat-message', (data) => {
    if (!chatMsgs) return; 
    
    const el = document.createElement('div');
    
    if (data.user === 'System') {
        el.innerHTML = `<i style="color: #a3be8c;">[СИСТЕМА] ${data.text}</i>`;
    } else {
        el.innerHTML = `<b style="color:#5e81ac">${data.user}:</b> ${data.text}`;
    }
    
    chatMsgs.appendChild(el);
    chatMsgs.scrollTop = chatMsgs.scrollHeight; 
});