const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = '8331842172:AAHV5pckoH8afnmF2-O03pke-2ck52W51H4'; 

// Настройка сервера
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());

/* ========================
    БАЗА ДАННЫХ (В ПАМЯТИ)
   ======================== */
const users = {}; 
let gamesData = [
    { id: 'parkour-default', name: 'Начальный уровень', author: 'TuBlox', desc: 'Добро пожаловать!', online: 0, visits: 0 }
];

let gameLevels = {
    'parkour-default': [
        { x: 0, y: 500, w: 2000, h: 50, type: 'floor', color: '#4c566a' },
        { x: 100, y: 440, w: 30, h: 60, type: 'spawn', color: '#bf616a' }
    ]
};

// Комнаты для игроков (хранят текущие блоки и координаты игроков)
const activeGames = {}; 

/* ========================
    МАРШРУТЫ (PAGES)
   ======================== */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/studio', (req, res) => res.sendFile(path.join(__dirname, 'public', 'studio.html')));

/* ========================
    API АВТОРИЗАЦИИ
   ======================== */

// Telegram Auth
app.post('/auth/telegram', (req, res) => {
    const data = req.body;
    const { hash, ...userData } = data;
    const checkString = Object.keys(userData).sort().map(key => `${key}=${userData[key]}`).join('\n');
    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (hmac !== hash) return res.status(403).json({ success: false });

    const username = userData.username || userData.first_name;
    if (!users[username]) users[username] = { uid: `tg_${userData.id}` };
    res.json({ success: true, username });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (users[username]) return res.status(409).json({ success: false, message: 'Занят' });
    users[username] = { password, uid: `u_${Date.now()}` };
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || user.password !== password) return res.status(401).json({ success: false });
    res.json({ success: true, uid: user.uid });
});

/* ========================
    API STUDIO (СОЗДАНИЕ И СОХРАНЕНИЕ)
   ======================== */

// Создать новую игру
app.post('/api/create-game', (req, res) => {
    const { name, author } = req.body;
    const id = `game-${Date.now()}`;
    
    const newGame = { id, name, author, desc: "Создано в Studio", online: 0, visits: 0 };
    gamesData.push(newGame);
    
    // Базовый шаблон уровня
    gameLevels[id] = [
        { x: 0, y: 500, w: 1000, h: 50, type: 'floor', color: '#4c566a' },
        { x: 50, y: 440, w: 30, h: 60, type: 'spawn', color: '#bf616a' }
    ];
    
    res.json({ success: true, id });
});

// Получить данные для редактора
app.get('/api/get-level/:id', (req, res) => {
    const level = gameLevels[req.params.id];
    if (level) res.json({ success: true, level });
    else res.status(404).json({ success: false });
});

// Сохранить изменения из Studio
app.post('/api/save-level/:id', (req, res) => {
    const { levelData, gameDetails } = req.body;
    const gameId = req.params.id;

    if (gameLevels[gameId]) {
        gameLevels[gameId] = levelData;
        const game = gamesData.find(g => g.id === gameId);
        if (game && gameDetails.name) game.name = gameDetails.name;
        
        io.emit('update-dashboard', gamesData); // Обновить список у всех
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});

/* ========================
    SOCKET.IO (ИГРОВОЙ ПРОЦЕСС)
   ======================== */

function updateOnline() {
    gamesData.forEach(game => {
        const room = activeGames[game.id];
        game.online = room ? Object.keys(room.players).length : 0;
    });
    io.emit('update-dashboard', gamesData);
}

io.on('connection', (socket) => {
    const { gameId, username } = socket.handshake.query;

    // Отправляем список игр сразу при подключении к Dashboard
    if (!gameId || gameId === 'null') {
        socket.emit('update-dashboard', gamesData);
        return;
    }

    // ЛОГИКА ВХОДА В ИГРУ
    if (!activeGames[gameId]) activeGames[gameId] = { players: {}, blocks: [] };
    const room = activeGames[gameId];
    
    socket.join(gameId);

    // Учет посещения
    const gameRecord = gamesData.find(g => g.id === gameId);
    if (gameRecord) gameRecord.visits++;

    // Создание игрока
    const spawn = gameLevels[gameId]?.find(b => b.type === 'spawn') || { x: 50, y: 100 };
    room.players[socket.id] = {
        id: socket.id,
        username: username || 'Guest',
        x: spawn.x,
        y: spawn.y - 50,
        vx: 0, vy: 0,
        grounded: false
    };

    updateOnline();

    // Отправка данных новому игроку
    socket.emit('initial-game-data', {
        levelData: gameLevels[gameId] || [],
        userBlocks: room.blocks
    });

    // Оповещение других
    io.to(gameId).emit('player-data', room.players);

    // Обработка перемещения
    socket.on('player-update', (data) => {
        if (room.players[socket.id]) {
            Object.assign(room.players[socket.id], data);
            socket.to(gameId).emit('player-data', room.players);
        }
    });

    // Чат
    socket.on('chat-message', (text) => {
        const msg = { user: username, text: text.substring(0, 100) };
        io.to(gameId).emit('chat-message', msg);
    });

    // Отключение
    socket.on('disconnect', () => {
        if (room.players[socket.id]) {
            delete room.players[socket.id];
            io.to(gameId).emit('player-disconnect', socket.id);
            updateOnline();
        }
    });
});

server.listen(PORT, () => console.log(`TuBlox Server: http://localhost:${PORT}`));