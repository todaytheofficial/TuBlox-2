const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Настройка статики (убедись, что файлы лежат в папке public или в корне)
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());

// --- БАЗА ДАННЫХ (В ПАМЯТИ) ---
const users = {}; 
const gamesData = [
    { id: 'parkour-1', name: 'Простой Паркур', author: 'TuBlox Dev', desc: 'Тестовый уровень для отработки прыжков.', online: 0, visits: 1200 },
    { id: 'arena-2', name: 'Песочница с Боем', author: 'Anon', desc: 'Огромная карта для PvP и строительства.', online: 0, visits: 800 },
];

const gameLevels = {
    'parkour-1': [
        { x: 0, y: 500, w: 3000, h: 50 }, 
        { x: 300, y: 400, w: 150, h: 20 }, 
        { x: 550, y: 350, w: 100, h: 20 }, 
        { x: 700, y: 280, w: 180, h: 20 }
    ],
    'arena-2': [
        { x: -500, y: 600, w: 4000, h: 50 },
        { x: 200, y: 400, w: 100, h: 20 }
    ]
};

// --- МАРШРУТЫ (FIX 404) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// API Авторизации
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Нужны имя и пароль.' });
    if (users[username]) return res.status(409).json({ success: false, message: 'Пользователь уже есть.' });
    const uniqueId = `uid_${Date.now()}`;
    users[username] = { password, uid: uniqueId };
    res.json({ success: true, uid: uniqueId });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || user.password !== password) return res.status(401).json({ success: false, message: 'Неверные данные.' });
    res.json({ success: true, uid: user.uid });
});

// --- SOCKET.IO ЛОГИКА ---
const io = socketIo(server);
const activeGames = {}; 

function updateOnlineCounts() {
    gamesData.forEach(game => {
        const room = activeGames[game.id];
        game.online = room ? Object.keys(room.players).length : 0;
    });
    io.emit('update-dashboard', gamesData); 
}

io.on('connection', (socket) => {
    // При любом подключении сразу отправляем список игр (Fix Dashboard)
    socket.emit('update-dashboard', gamesData);

    const { gameId, username } = socket.handshake.query;
    
    // Если игрок просто в Dashboard, дальше не идем
    if (!gameId || gameId === 'null' || gameId === 'undefined') return;

    if (!activeGames[gameId]) {
        activeGames[gameId] = { players: {}, blocks: [] };
    }
    const room = activeGames[gameId];
    socket.join(gameId);

    const newPlayer = {
        id: socket.id,
        username: username || 'Гость',
        x: 50, y: 100, vx: 0, grounded: false,
        color: '#5e81ac' // Основной цвет персонажа
    };
    room.players[socket.id] = newPlayer;

    updateOnlineCounts();
    
    // Рассылаем данные игрокам в комнате
    io.to(gameId).emit('player-data', room.players);
    io.to(gameId).emit('chat-message', { user: 'System', text: `${newPlayer.username} вошел!` });
    
    socket.emit('initial-game-data', {
        levelData: gameLevels[gameId] || gameLevels['parkour-1'],
        userBlocks: room.blocks
    });

    socket.on('player-update', (data) => {
        if (room.players[socket.id]) {
            Object.assign(room.players[socket.id], data);
            // Оптимизация: используем broadcast, чтобы не слать данные самому себе
            socket.to(gameId).emit('player-data', room.players);
        }
    });

    socket.on('chat-message', (text) => {
        if (!text.trim()) return;
        const msg = { user: room.players[socket.id]?.username || 'Анон', text: text.substring(0, 100) };
        io.to(gameId).emit('chat-message', msg);
    });

    socket.on('disconnect', () => {
        if (room.players[socket.id]) {
            const name = room.players[socket.id].username;
            delete room.players[socket.id];
            io.to(gameId).emit('player-disconnect', socket.id);
            io.to(gameId).emit('chat-message', { user: 'System', text: `${name} покинул игру.` });
            updateOnlineCounts();
        }
    });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));