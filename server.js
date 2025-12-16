const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ===================================
// 1. НАСТРОЙКА MIDDLEWARE
// ===================================
app.use(express.static('public'));
app.use(express.json());


// ===================================
// 2. ДАННЫЕ ИГР И ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЕЙ
// ===================================

const users = {}; 

const gamesData = [
    { id: 'parkour-1', name: 'Простой Паркур', author: 'TuBlox Dev', desc: 'Тестовый уровень для отработки прыжков и коллизии и строительства.', online: 0, visits: 1200 },
    { id: 'arena-2', name: 'Песочница с Боем', author: 'Anon', desc: 'Огромная карта для PvP и строительства.', online: 0, visits: 800 },
];

// Карта уровней. Каждый ID игры имеет свой набор статических платформ.
const gameLevels = {
    'parkour-1': [
        // Пол
        { x: 0, y: 500, w: 3000, h: 50 }, 
        // Платформы
        { x: 300, y: 400, w: 150, h: 20 }, 
        { x: 550, y: 350, w: 100, h: 20 }, 
        { x: 700, y: 280, w: 180, h: 20 }, 
        { x: 1000, y: 200, w: 80, h: 20 },   
        { x: 1200, y: 150, w: 80, h: 20 },
        { x: 1400, y: 100, w: 80, h: 20 }, 
        { x: 1700, y: 300, w: 400, h: 20 }
    ],
    'arena-2': [
        // Плоский большой уровень
        { x: -500, y: 600, w: 4000, h: 50 },
        { x: 200, y: 400, w: 100, h: 20 } // Немного для начала
    ]
};


// ===================================
// 3. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ (REST API)
// ===================================

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Username and password are required.' });
    if (users[username]) return res.status(409).json({ success: false, message: 'User already exists.' });

    const uniqueId = `uid_${Date.now()}`;
    users[username] = { password, uid: uniqueId };
    console.log(`[AUTH] New user registered: ${username}`);
    return res.json({ success: true, message: 'Registration successful.', uid: uniqueId });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || user.password !== password) return res.status(401).json({ success: false, message: 'Invalid username or password.' });

    console.log(`[AUTH] User logged in: ${username}`);
    return res.json({ success: true, message: 'Login successful.', uid: user.uid });
});

app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.path.includes('.')) {
        res.status(404).json({ success: false, message: 'Not Found' });
    } else {
        next();
    }
});


// ===================================
// 4. МУЛЬТИПЛЕЕР (SOCKET.IO)
// ===================================

const io = socketIo(server);
const activeGames = {}; 

function updateOnlineCounts() {
    gamesData.forEach(game => game.online = 0);
    for (const gameId in activeGames) {
        const game = gamesData.find(g => g.id === gameId);
        if (game) {
            game.online = Object.keys(activeGames[gameId].players).length;
        }
    }
    io.emit('update-dashboard', gamesData); 
}

io.on('connection', (socket) => {
    const { gameId, username, uniqueUserId } = socket.handshake.query;

    if (!gameId) {
        updateOnlineCounts();
        return; 
    }

    // --- ЛОГИКА ИГРОВОЙ КОМНАТЫ ---

    if (!activeGames[gameId]) {
        activeGames[gameId] = {
            players: {},
            chat: [],
            blocks: [] // НОВОЕ: Уникальный массив блоков для этой комнаты
        };
    }

    const room = activeGames[gameId];

    socket.join(gameId);

    const newPlayer = {
        id: socket.id,
        username: username || 'Гость',
        uniqueUserId: uniqueUserId || socket.id,
        x: 50, y: 100, w: 40, h: 60, vx: 0, grounded: false
    };
    room.players[socket.id] = newPlayer;

    updateOnlineCounts(); 
    io.to(gameId).emit('player-data', room.players);
    io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${username} подключился!` });
    
    // ОТПРАВЛЯЕМ КЛИЕНТУ ДАННЫЕ УРОВНЯ И БЛОКИ
    socket.emit('initial-game-data', {
        levelData: gameLevels[gameId] || gameLevels['parkour-1'], // Отправляем нужный уровень
        userBlocks: room.blocks // Отправляем текущие построенные блоки
    });

    // --- Обработка Билдинга ---
    socket.on('add-block', (block) => {
        if (!room.blocks.some(b => b.x === block.x && b.y === block.y)) {
            room.blocks.push(block);
            io.to(gameId).emit('update-blocks', room.blocks); // Рассылаем всем
        }
    });

    socket.on('remove-block', (block) => {
        const index = room.blocks.findIndex(b => b.x === block.x && b.y === block.y);
        if (index !== -1) {
            room.blocks.splice(index, 1);
            io.to(gameId).emit('update-blocks', room.blocks); // Рассылаем всем
        }
    });

    // --- Остальные события ---
    socket.on('player-update', (data) => {
        const p = room.players[socket.id];
        if (p) {
            p.x = data.x; p.y = data.y; p.vx = data.vx; p.grounded = data.grounded;
            if (data.w) p.w = data.w;
            if (data.h) p.h = data.h;
            socket.to(gameId).emit('player-data', room.players);
        }
    });

    socket.on('chat-message', (text) => {
        const playerUsername = room.players[socket.id] ? room.players[socket.id].username : 'Unknown';
        const message = { user: playerUsername, text: text, timestamp: Date.now() };
        room.chat.push(message); 
        if (room.chat.length > 50) room.chat.shift(); 
        io.to(gameId).emit('chat-message', message);
    });

    socket.on('disconnect', () => {
        const disconnectedPlayer = room.players[socket.id];
        if (disconnectedPlayer) {
            delete room.players[socket.id];
            socket.to(gameId).emit('player-disconnect', socket.id);
            io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${disconnectedPlayer.username} отключился.` });
            
            if (Object.keys(room.players).length === 0) {
                // Если комната пуста и никто не строил блоки, можно удалить
                if (room.blocks.length === 0) delete activeGames[gameId];
            }
            updateOnlineCounts();
        }
    });
});


// ===================================
// 5. ЗАПУСК СЕРВЕРА
// ===================================

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});