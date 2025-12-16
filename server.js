const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto'); // Необходимо для проверки подписи Telegram

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

const BOT_TOKEN = '8331842172:AAHV5pckoH8afnmF2-O03pke-2ck52W51H4'; 

// Настройка статики и парсинга JSON
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

// --- МАРШРУТЫ ДЛЯ HTML ФАЙЛОВ ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/game', (req, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));

// --- API АВТОРИЗАЦИИ ---

// 1. Telegram Auth (Новый маршрут)
app.post('/auth/telegram', (req, res) => {
    const data = req.body;

    // Валидация данных Telegram (проверка хеша)
    const { hash, ...userData } = data;
    const checkString = Object.keys(userData)
        .sort()
        .map(key => `${key}=${userData[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (hmac !== hash) {
        return res.status(403).json({ success: false, message: 'Ошибка безопасности: данные подделаны.' });
    }

    const username = userData.username || userData.first_name;
    
    // Сохраняем или обновляем пользователя в памяти
    if (!users[username]) {
        users[username] = { uid: `tg_${userData.id}`, isTG: true };
    }

    res.json({ success: true, username: username });
});

// 2. Обычная регистрация
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Нужны имя и пароль.' });
    if (users[username]) return res.status(409).json({ success: false, message: 'Пользователь уже существует.' });
    
    const uniqueId = `uid_${Date.now()}`;
    users[username] = { password, uid: uniqueId };
    res.json({ success: true, uid: uniqueId });
});

// 3. Обычный вход
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
    socket.emit('update-dashboard', gamesData);

    const { gameId, username } = socket.handshake.query;
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
        color: '#5e81ac'
    };
    room.players[socket.id] = newPlayer;

    updateOnlineCounts();
    
    io.to(gameId).emit('player-data', room.players);
    io.to(gameId).emit('chat-message', { user: 'System', text: `${newPlayer.username} вошел!` });
    
    socket.emit('initial-game-data', {
        levelData: gameLevels[gameId] || gameLevels['parkour-1'],
        userBlocks: room.blocks
    });

    socket.on('player-update', (data) => {
        if (room.players[socket.id]) {
            Object.assign(room.players[socket.id], data);
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