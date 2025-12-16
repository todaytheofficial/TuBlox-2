const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// ===================================
// 1. НАСТРОЙКА MIDDLEWARE
// ===================================

// Разрешаем Express читать статические файлы (HTML, CSS, JS) из папки 'public'
app.use(express.static('public'));

// Middleware для обработки JSON данных в теле POST-запросов (ОЧЕНЬ ВАЖНО для Auth)
app.use(express.json());


// ===================================
// 2. ДАННЫЕ ИГР И ХРАНИЛИЩЕ ПОЛЬЗОВАТЕЛЕЙ
// ===================================

const users = {}; // Хранение пользователей (ВРЕМЕННОЕ, в реале нужна БД!)

const gamesData = [
    { id: 'parkour-1', name: 'Простой Паркур', author: 'TuBlox Dev', desc: 'Тестовый уровень для отработки прыжков и коллизии.', online: 0, visits: 1200 },
    { id: 'arena-2', name: 'Песочница с Боем', author: 'Anon', desc: 'Огромная карта для PvP и строительства.', online: 0, visits: 800 },
];


// ===================================
// 3. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ (REST API)
// ===================================

/**
 * Маршрут для Регистрации: POST /api/register
 */
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    if (users[username]) {
        return res.status(409).json({ success: false, message: 'User already exists.' });
    }

    const uniqueId = `uid_${Date.now()}`;
    users[username] = { password, uid: uniqueId };
    console.log(`[AUTH] New user registered: ${username}`);

    return res.json({ 
        success: true, 
        message: 'Registration successful. You can now log in.',
        uid: uniqueId
    });
});

/**
 * Маршрут для Логина: POST /api/login
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = users[username];

    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    console.log(`[AUTH] User logged in: ${username}`);
    
    return res.json({ 
        success: true, 
        message: 'Login successful.',
        uid: user.uid
    });
});

// Обработка 404 для API
app.use((req, res, next) => {
    // Если запрос не был обработан выше (GET /game.html, POST /api/login и т.д.)
    if (req.method !== 'GET' || !req.path.includes('.')) {
        res.status(404).json({ success: false, message: 'Not Found' });
    } else {
        next(); // Продолжаем, если это, например, GET-запрос статического файла, который не найден
    }
});


// ===================================
// 4. МУЛЬТИПЛЕЕР (SOCKET.IO)
// ===================================

const io = socketIo(server);
const activeGames = {}; // { 'parkour-1': { players: {}, chat: [] } }

// Функция для обновления счетчика онлайна и отправки на дашборд
function updateOnlineCounts() {
    gamesData.forEach(game => game.online = 0);
    
    for (const gameId in activeGames) {
        const game = gamesData.find(g => g.id === gameId);
        if (game) {
            game.online = Object.keys(activeGames[gameId].players).length;
        }
    }
    // Отправляем обновленный список всем, кто подключен
    io.emit('update-dashboard', gamesData); 
}

io.on('connection', (socket) => {
    const { gameId, username, uniqueUserId } = socket.handshake.query;

    // ЕСЛИ НЕТ gameId, то это подключение с DASHBOARD
    if (!gameId) {
        updateOnlineCounts();
        return; 
    }

    // --- ЛОГИКА ИГРОВОЙ КОМНАТЫ ---

    if (!activeGames[gameId]) {
        activeGames[gameId] = {
            players: {},
            chat: []
        };
    }

    const room = activeGames[gameId];

    socket.join(gameId);

    const newPlayer = {
        id: socket.id,
        username: username || 'Гость',
        uniqueUserId: uniqueUserId || socket.id,
        x: 50, 
        y: 100,
        w: 40, // Передаем новые размеры
        h: 60,
        vx: 0,
        grounded: false
    };
    room.players[socket.id] = newPlayer;

    updateOnlineCounts(); // Обновляем счетчик онлайна
    io.to(gameId).emit('player-data', room.players);
    io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${username} подключился!` });
    
    // --- Обработка событий ---

    socket.on('player-update', (data) => {
        const p = room.players[socket.id];
        if (p) {
            p.x = data.x;
            p.y = data.y;
            p.vx = data.vx;
            p.grounded = data.grounded;
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
                delete activeGames[gameId];
            }
            updateOnlineCounts(); // Обновляем счетчик после отключения
        }
    });
});


// ===================================
// 5. ЗАПУСК СЕРВЕРА
// ===================================

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});