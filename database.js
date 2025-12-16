const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'users.json');

// Загрузка базы или создание новой
function loadUsers() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    try {
        return JSON.parse(fs.readFileSync(dbPath));
    } catch (e) {
        console.error("Ошибка чтения users.json:", e);
        return {};
    }
}

function saveUser(username, password) {
    const users = loadUsers();
    
    // Проверка, что ник не занят (регистронезависимо)
    if (Object.keys(users).some(key => key.toLowerCase() === username.toLowerCase())) {
        return false; 
    }

    users[username] = { 
        password, // В реальном проекте тут должен быть хеш пароля!
        skinColor: '#ffccaa',
        shirtColor: '#00e5ff'
    };
    fs.writeFileSync(dbPath, JSON.stringify(users, null, 2));
    return true;
}

function checkUser(username, password) {
    const users = loadUsers();
    return users[username] && users[username].password === password;
}

module.exports = { saveUser, checkUser };