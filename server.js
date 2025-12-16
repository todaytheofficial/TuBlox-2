const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const db = require('./database'); // Предполагается, что database.js существует
const path = require('path');

// Разрешаем Express использовать файлы из папки public
app.use(express.static('public'));
app.use(express.json()); 

// Перенаправление с корня на dashboard.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- API РЕГИСТРАЦИИ И ВХОДА ---
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, msg: 'Заполни все поля!' });
    
    // database.js должен экспортировать saveUser
    if (db.saveUser(username, password)) {
        res.json({ success: true });
    } else {
        res.json({ success: false, msg: 'Ник занят или содержит недопустимые символы!' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // database.js должен экспортировать checkUser
    if (db.checkUser(username, password)) {
        res.json({ success: true, username });
    } else {
        res.json({ success: false, msg: 'Неверный логин или пароль' });
    }
});

// --- ИГРОВАЯ ЛОГИКА ---
let games = {
    "parkour-1": {
        id: "parkour-1",
        name: "ТуБлокс: Запуск",
        author: "Admin",
        desc: "Первая карта для теста физики и сети.",
        visits: 1240,
        onlineUsers: new Set() // Используем Set для уникального подсчета
    }
};

// Хранилище всех игроков в игре: { socketId: { x, y, vx, username, gameId, ... } }
let gamePlayers = {}; 

io.on('connection', (socket) => {
    const { gameId, username, uniqueUserId } = socket.handshake.query;
    
    if (gameId && games[gameId]) {
        socket.join(gameId);

        // 1. Добавляем игрока в общее хранилище
        gamePlayers[socket.id] = { 
            x: 50, y: 200, w: 30, h: 30, // Начальная позиция игрока
            vx: 0, vy: 0, 
            username: username || 'Гость', 
            gameId: gameId 
        };

        // Логика подсчета онлайна
        const prevOnline = games[gameId].onlineUsers.size;
        games[gameId].onlineUsers.add(uniqueUserId);
        
        if (games[gameId].onlineUsers.size > prevOnline) {
            io.emit('update-dashboard', getPublicGameData());
        }

        // Уведомление о входе
        if (username) {
            io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${username} подключился!` });
        }

        // 2. ОБРАБОТЧИК ОБНОВЛЕНИЯ ПОЗИЦИИ ИГРОКА (С клиента на сервер)
        socket.on('player-update', (data) => {
            const p = gamePlayers[socket.id];
            if (p) {
                p.x = data.x;
                p.y = data.y;
                p.vx = data.vx;
                p.grounded = data.grounded;
            }
        });
        
        // 3. Чат
        socket.on('chat-message', (msg) => {
            io.to(gameId).emit('chat-message', { user: username || 'Гость', text: msg });
        });

        // 4. Отключение
        socket.on('disconnect', () => {
            const p = gamePlayers[socket.id];
            if (p) {
                // Уведомление об отключении
                io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${p.username} отключился.` });
                io.to(gameId).emit('player-disconnect', socket.id);
            }
            delete gamePlayers[socket.id];
            
            // Логика уменьшения онлайна
            games[gameId].onlineUsers.delete(uniqueUserId);
            io.emit('update-dashboard', getPublicGameData());
        });
    }

    // Отправляем список игр новому подключившемуся
    socket.emit('update-dashboard', getPublicGameData());
});

// --- ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ СЕРВЕРА (РАССЫЛКА ПОЗИЦИЙ) ---
setInterval(() => {
    for (const id in games) {
        const roomPlayers = {};
        
        // Собираем данные только для текущей комнаты
        for (const socketId in gamePlayers) {
            if (gamePlayers[socketId].gameId === id) {
                // Отправляем только необходимые данные
                roomPlayers[socketId] = {
                    x: gamePlayers[socketId].x,
                    y: gamePlayers[socketId].y,
                    w: gamePlayers[socketId].w,
                    h: gamePlayers[socketId].h,
                    vx: gamePlayers[socketId].vx,
                    grounded: gamePlayers[socketId].grounded,
                    username: gamePlayers[socketId].username
                };
            }
        }
        
        // Отправляем собранные данные всем игрокам в этой комнате
        io.to(id).emit('player-data', roomPlayers);
    }
}, 1000 / 30); // 30 раз в секунду

function getPublicGameData() {
    return Object.values(games).map(g => ({
        id: g.id,
        name: g.name,
        author: g.author,
        desc: g.desc,
        visits: g.visits,
        online: g.onlineUsers.size 
    })).sort((a, b) => b.online - a.online);
}

http.listen(3000, () => {
    console.log('TuBlox 2 Server running on port 3000');
});