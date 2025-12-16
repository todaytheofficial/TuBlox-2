const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('id') || 'parkour-1';
const username = localStorage.getItem('tublox_username') || 'Игрок';

const socket = io({ query: { gameId, username } });

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Состояние игры
let isLoaded = false; // Ждем данные от сервера
let otherPlayers = {}; 
let levelData = []; 
let userBlocks = []; 
let isChatActive = false;
let walkAnim = 0; 

const keys = { right: false, left: false, up: false }; 
const player = { x: 100, y: 100, w: 30, h: 60, vx: 0, vy: 0, grounded: false };
const gravity = 0.6;
const jumpForce = -13;

// --- ОТРИСОВКА ПЕРСОНАЖА ---
function drawHuman(x, y, vx, vy, grounded, name, color) {
    const centerX = x + 15;
    const isMoving = Math.abs(vx) > 0.5 && grounded;
    
    if (isMoving) walkAnim += 0.2;
    else walkAnim = 0;

    const legMove = Math.sin(walkAnim) * 12;
    const armMove = Math.sin(walkAnim) * 10;

    ctx.save();
    
    // Никнейм
    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.fillText(name, centerX, y - 25);
    ctx.shadowBlur = 0;

    // НОГИ
    ctx.fillStyle = "#1a1a1a";
    if (!grounded) {
        ctx.fillRect(centerX - 10, y + 45, 8, 12);
        ctx.fillRect(centerX + 2, y + 40, 8, 12);
    } else {
        ctx.fillRect(centerX - 11, y + 45 + legMove, 9, 15);
        ctx.fillRect(centerX + 2, y + 45 - legMove, 9, 15);
    }

    // ТЕЛО
    ctx.fillStyle = color;
    ctx.fillRect(centerX - 12, y + 15, 24, 30);

    // РУКИ
    ctx.fillStyle = "#ffccaa";
    if (isMoving) {
        ctx.fillRect(centerX - 18, y + 18 - armMove, 6, 20);
        ctx.fillRect(centerX + 12, y + 18 + armMove, 6, 20);
    } else {
        ctx.fillRect(centerX - 18, y + 18, 6, 20);
        ctx.fillRect(centerX + 12, y + 18, 6, 20);
    }

    // ГОЛОВА
    ctx.fillStyle = "#ffccaa";
    ctx.fillRect(centerX - 10, y - 5, 20, 20);
    
    // ГЛАЗА
    ctx.fillStyle = "black";
    let look = vx >= 0 ? 3 : -7;
    ctx.fillRect(centerX + look, y + 2, 4, 4);
    ctx.fillRect(centerX + look + 5, y + 2, 4, 4);

    ctx.restore();
}

// --- УПРАВЛЕНИЕ ---
window.addEventListener('keydown', e => {
    if (isChatActive) return;
    if (['KeyD', 'ArrowRight', 'в', 'В'].includes(e.code) || e.key === 'в' || e.key === 'В') keys.right = true;
    if (['KeyA', 'ArrowLeft', 'ф', 'Ф'].includes(e.code) || e.key === 'ф' || e.key === 'Ф') keys.left = true;
    if (['KeyW', 'ArrowUp', 'Space', 'ц', 'Ц'].includes(e.code) || e.key === 'ц' || e.key === 'Ц') keys.up = true;
});

window.addEventListener('keyup', e => {
    if (['KeyD', 'ArrowRight', 'в', 'В'].includes(e.code) || e.key === 'в' || e.key === 'В') keys.right = false;
    if (['KeyA', 'ArrowLeft', 'ф', 'Ф'].includes(e.code) || e.key === 'ф' || e.key === 'Ф') keys.left = false;
    if (['KeyW', 'ArrowUp', 'Space', 'ц', 'Ц'].includes(e.code) || e.key === 'ц' || e.key === 'Ц') keys.up = false;
});

// МОБИЛЬНЫЙ ДЖОЙСТИК
const stick = document.getElementById('joystick-stick');
const base = document.getElementById('joystick-base');

if (base && stick) {
    function handleJoystick(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const baseRect = base.getBoundingClientRect();
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;
        
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const maxDist = 40;

        if (dist > maxDist) {
            dx *= maxDist / dist;
            dy *= maxDist / dist;
        }

        stick.style.transform = `translate(${dx}px, ${dy}px)`;
        keys.left = dx < -15;
        keys.right = dx > 15;
    }

    base.addEventListener('touchstart', handleJoystick, {passive: false});
    base.addEventListener('touchmove', handleJoystick, {passive: false});
    base.addEventListener('touchend', () => {
        stick.style.transform = `translate(0, 0)`;
        keys.left = keys.right = false;
    });
}

const jumpBtn = document.getElementById('btn-jump');
if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys.up = true; }, {passive: false});
    jumpBtn.addEventListener('touchend', () => keys.up = false);
}

// --- ФИЗИКА ---
function update() {
    if (!isLoaded) return; // НЕ ДВИГАЕМСЯ, ПОКА НЕТ КАРТЫ

    if (keys.right) player.vx += 0.8;
    if (keys.left) player.vx -= 0.8;
    
    player.vx *= 0.85; // Трение
    player.vy += gravity;

    if (keys.up && player.grounded) {
        player.vy = jumpForce;
        player.grounded = false;
    }

    // Проверка падения в бездну
    if (player.y > 1500) {
        player.x = 100;
        player.y = 100;
        player.vy = 0;
    }

    const allObstacles = [...levelData, ...userBlocks];

    // Столкновения по Y
    player.y += player.vy;
    player.grounded = false;
    for (let rect of allObstacles) {
        if (player.x < rect.x + rect.w && player.x + player.w > rect.x &&
            player.y < rect.y + rect.h && player.y + player.h > rect.y) {
            
            if (player.vy > 0) { // Падаем вниз
                player.y = rect.y - player.h;
                player.vy = 0;
                player.grounded = true;
            } else if (player.vy < 0) { // Прыгаем вверх (ударились головой)
                player.y = rect.y + rect.h;
                player.vy = 0;
            }
        }
    }

    // Столкновения по X
    player.x += player.vx;
    for (let rect of allObstacles) {
        if (player.x < rect.x + rect.w && player.x + player.w > rect.x &&
            player.y < rect.y + rect.h && player.y + player.h > rect.y) {
            
            if (player.vx > 0) player.x = rect.x - player.w;
            else if (player.vx < 0) player.x = rect.x + rect.w;
            player.vx = 0;
        }
    }
}

// --- ОТРИСОВКА ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const camX = canvas.width / 2 - player.x;
    const camY = canvas.height / 2 - player.y;

    ctx.save();
    ctx.translate(camX, camY);

    // Рисуем уровень
    ctx.fillStyle = '#4c566a'; // Цвет платформ
    levelData.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));
    
    ctx.fillStyle = '#b48ead'; // Цвет блоков игроков
    userBlocks.forEach(r => ctx.fillRect(r.x, r.y, r.w, r.h));

    // Другие игроки
    for (let id in otherPlayers) {
        let p = otherPlayers[id];
        drawHuman(p.x, p.y, p.vx || 0, 0, p.grounded, p.username, '#d08770');
    }
    
    // Наш игрок
    drawHuman(player.x, player.y, player.vx, player.vy, player.grounded, username, '#81a1c1');

    ctx.restore();
}

function loop() {
    update();
    draw();
    
    // Оптимизация: шлем данные, только когда персонаж не спит
    if (isLoaded) {
        socket.emit('player-update', { 
            x: player.x, 
            y: player.y, 
            vx: player.vx, 
            grounded: player.grounded 
        });
    }
    requestAnimationFrame(loop);
}

// --- ЧАТ И СОБЫТИЯ ---
const chatInput = document.getElementById('chat-input');
if (chatInput) {
    chatInput.addEventListener('focus', () => isChatActive = true);
    chatInput.addEventListener('blur', () => isChatActive = false);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            socket.emit('chat-message', chatInput.value);
            chatInput.value = '';
            chatInput.blur();
        }
    });
}

socket.on('chat-message', d => {
    const m = document.createElement('div');
    m.className = 'chat-msg';
    m.innerHTML = `<b>${d.user}:</b> ${d.text}`;
    const box = document.getElementById('chat-messages');
    if (box) {
        box.appendChild(m);
        box.scrollTop = box.scrollHeight;
    }
});

socket.on('initial-game-data', d => { 
    levelData = d.levelData; 
    userBlocks = d.userBlocks; 
    isLoaded = true; // РАЗРЕШАЕМ ИГРУ
});

socket.on('player-data', p => { 
    otherPlayers = p; 
    delete otherPlayers[socket.id]; 
});

socket.on('player-disconnect', id => delete otherPlayers[id]);

// Запуск
loop();