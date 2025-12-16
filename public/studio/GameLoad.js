// studio/GameLoad.js

const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('id');
const username = localStorage.getItem('tublox_username');

let gameLevel = [];
let gameDetails = {};

if (!gameId || !username) {
    alert('Game ID or user not found. Redirecting to dashboard.');
    window.location.href = '/dashboard';
}

function loadLevel() {
    fetch(`/api/get-level/${gameId}`, {
        headers: { 'x-username': username }
    })
    .then(res => {
        if (res.status === 401 || res.status === 403) {
            alert('Unauthorized or Forbidden. Returning to Dashboard.');
            window.location.href = '/dashboard';
            return;
        }
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
    })
    .then(data => {
        if (data.success) {
            gameLevel = data.level;
            gameDetails = data.gameDetails;
            
            // Загрузка деталей в модальное окно публикации
            document.getElementById('pub-name').value = gameDetails.name;
            document.getElementById('pub-desc').value = gameDetails.desc;
            document.getElementById('pub-status').value = String(gameDetails.published);
            
            if (gameDetails.avatar) {
                const img = document.getElementById('pub-avatar-preview');
                img.src = gameDetails.avatar;
                img.style.display = 'block';
            }

            console.log('Level loaded:', gameLevel);
            // Запуск отрисовки после загрузки
            loop(); 
        } else {
            throw new Error(data.message || 'Failed to load game data.');
        }
    })
    .catch(err => {
        console.error('Loading error:', err);
        alert('Failed to load game data: ' + err.message);
    });
}

document.addEventListener('DOMContentLoaded', loadLevel);