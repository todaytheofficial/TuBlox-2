const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Настройки для Heroku/Render или другого хостинга
const PORT = process.env.PORT || 3000;

// ===================================
// 1. НАСТРОЙКА MIDDLEWARE
// ===================================

// Разрешаем Express читать статические файлы (HTML, CSS, JS) из папки 'public'
app.use(express.static('public'));

// Middleware для обработки JSON данных в теле POST-запросов (ОЧЕНЬ ВАЖНО для Auth)
app.use(express.json());


// ===================================
// 2. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ (REST API)
// ===================================

// ВНИМАНИЕ: В реальном приложении здесь должна быть база данных! 
// Для примера мы используем простой объект для хранения пользователей.
const users = {}; 

/**
 * Маршрут для Регистрации
 * URL: POST /api/register
 */
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    if (users[username]) {
        return res.status(409).json({ success: false, message: 'User already exists.' });
    }

    // Сохраняем нового пользователя (В РЕАЛЬНОСТИ: шифруем пароль и сохраняем в БД)
    const uniqueId = `uid_${Date.now()}`;
    users[username] = { password, uid: uniqueId };
    console.log(`[AUTH] New user registered: ${username}`);

    return res.json({ 
        success: true, 
        message: 'Registration successful. You can now log in.',
        uid: uniqueId // Отдаем ID клиенту для использования в сессии
    });
});

/**
 * Маршрут для Логина
 * URL: POST /api/login
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const user = users[username];

    if (!user || user.password !== password) {
        // Используем 401 Unauthorized для ошибки аутентификации
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    console.log(`[AUTH] User logged in: ${username}`);
    
    // Успешный логин
    return res.json({ 
        success: true, 
        message: 'Login successful.',
        uid: user.uid
    });
});

// Если запрошенный URL не найден (404), отправляем JSON-ответ
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'Not Found' });
});


// ===================================
// 3. МУЛЬТИПЛЕЕР (SOCKET.IO)
// ===================================

const io = socketIo(server);
const activeGames = {}; // Хранилище для всех игровых комнат

io.on('connection', (socket) => {
    // Получаем параметры из URL, переданные при подключении
    const { gameId, username, uniqueUserId } = socket.handshake.query;

    if (!gameId) {
        console.log(`[SOCKET] Disconnecting unassigned socket: ${socket.id}`);
        socket.disconnect();
        return;
    }

    // Инициализация игровой комнаты, если ее нет
    if (!activeGames[gameId]) {
        activeGames[gameId] = {
            players: {},
            chat: []
        };
        console.log(`[SERVER] Game room created: ${gameId}`);
    }

    const room = activeGames[gameId];

    // Присоединение игрока к комнате
    socket.join(gameId);

    // Инициализация данных нового игрока
    const newPlayer = {
        id: socket.id,
        username: username || 'Гость',
        uniqueUserId: uniqueUserId || socket.id,
        x: 50, // Начальная позиция
        y: 100,
        w: 40, // Размеры по последним правкам
        h: 60,
        vx: 0,
        grounded: false
    };
    room.players[socket.id] = newPlayer;

    console.log(`[CONNECT] ${username} (${socket.id}) joined room ${gameId}`);

    // Отправляем всем игрокам в комнате обновленные данные всех игроков
    io.to(gameId).emit('player-data', room.players);
    // Отправляем системное сообщение в чат
    io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${username} подключился!` });
    
    // --- Обработка событий ---

    // 1. Обновление позиции игрока
    socket.on('player-update', (data) => {
        const p = room.players[socket.id];
        if (p) {
            // Обновляем только разрешенные поля
            p.x = data.x;
            p.y = data.y;
            p.vx = data.vx;
            p.grounded = data.grounded;
            // Обновляем размеры, если они были переданы (для синхронизации)
            if (data.w) p.w = data.w;
            if (data.h) p.h = data.h;
            
            // Отправляем обновленные данные всем, кроме отправителя
            socket.to(gameId).emit('player-data', room.players);
        }
    });

    // 2. Обработка сообщений чата
    socket.on('chat-message', (text) => {
        const playerUsername = room.players[socket.id] ? room.players[socket.id].username : 'Unknown';
        const message = { user: playerUsername, text: text, timestamp: Date.now() };
        
        // Добавляем в историю комнаты и ограничиваем, если нужно
        room.chat.push(message); 
        if (room.chat.length > 50) room.chat.shift(); 
        
        // Отправляем сообщение всем в комнате
        io.to(gameId).emit('chat-message', message);
    });

    // 3. Отключение игрока
    socket.on('disconnect', () => {
        const disconnectedPlayer = room.players[socket.id];
        if (disconnectedPlayer) {
            delete room.players[socket.id];
            console.log(`[DISCONNECT] ${disconnectedPlayer.username} (${socket.id}) left room ${gameId}`);

            // Оповещаем остальных игроков о разъединении
            socket.to(gameId).emit('player-disconnect', socket.id);
            io.to(gameId).emit('chat-message', { user: 'System', text: `Игрок ${disconnectedPlayer.username} отключился.` });
            
            // Если комната пуста, удаляем ее
            if (Object.keys(room.players).length === 0) {
                delete activeGames[gameId];
                console.log(`[SERVER] Game room deleted: ${gameId}`);
            }
        }
    });
});


// ===================================
// 4. ЗАПУСК СЕРВЕРА
// ===================================

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});