/**
 * Файл: public/auth.js
 * Содержит функции для регистрации, входа, выхода и проверки авторизации.
 */

// Генерируем уникальный ID устройства для анти-накрутки, если его нет
let uniqueUserId = localStorage.getItem('tublox_uid');
if (!uniqueUserId) {
    uniqueUserId = 'device_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('tublox_uid', uniqueUserId);
}

const authMsg = document.getElementById('auth-msg');

/**
 * Отправляет данные на сервер для регистрации или входа.
 */
async function authenticate(endpoint, username, password) {
    if (authMsg) authMsg.innerText = '';

    if (!username || !password) {
        if (authMsg) authMsg.innerText = 'Пожалуйста, заполните все поля.';
        return;
    }

    try {
        const res = await fetch(`/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem('tublox_username', username);
            window.location.href = 'dashboard.html';
        } else {
            if (authMsg) authMsg.innerText = data.msg || `Ошибка ${endpoint}.`;
        }
    } catch (error) {
        if (authMsg) authMsg.innerText = 'Ошибка подключения к серверу.';
        console.error('Auth error:', error);
    }
}

/**
 * Проверяет авторизацию и перенаправляет, если необходимо.
 * @param {boolean} isAuthPage - true, если мы на login.html или register.html
 */
function checkAuthAndRedirect(isAuthPage) {
    const savedUser = localStorage.getItem('tublox_username');
    
    // Получаем текущий путь (например, 'dashboard.html' или 'game.html')
    const currentPath = window.location.pathname.split('/').pop();

    if (savedUser) {
        // Если авторизован, и пытается попасть на login/register, перенаправляем на dashboard
        if (isAuthPage) {
            window.location.href = 'dashboard.html';
        }
    } else {
        // Если НЕ авторизован, и пытается попасть куда-либо, кроме login/register, перенаправляем на login
        if (currentPath !== 'login.html' && currentPath !== 'register.html') {
            window.location.href = 'login.html';
        }
    }
}

/**
 * Функция для выхода
 */
function logout() {
    localStorage.removeItem('tublox_username');
    window.location.href = 'login.html';
}