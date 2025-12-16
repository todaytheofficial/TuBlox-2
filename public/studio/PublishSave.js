// studio/PublishSave.js

function openPublishModal() {
    document.getElementById('publish-modal').style.display = 'block';
}

function closePublishModal() {
    document.getElementById('publish-modal').style.display = 'none';
}

function confirmPublish() {
    const name = document.getElementById('pub-name').value;
    const desc = document.getElementById('pub-desc').value;
    const published = document.getElementById('pub-status').value === 'true';
    // TODO: Здесь должна быть логика загрузки файла/аватара, но пока пропустим ее для простоты
    const avatar = gameDetails.avatar; // Сохраняем старый аватар или пусто

    const gameDetailsUpdate = { name, desc, avatar, published };
    
    // Сохранение уровня и деталей игры
    fetch(`/api/save-level/${gameId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-username': username
        },
        body: JSON.stringify({ 
            levelData: gameLevel, 
            gameDetails: gameDetailsUpdate 
        })
    })
    .then(res => {
        if (!res.ok) {
            if (res.status === 413) throw new Error('Level data is too large. Server limit exceeded.');
            throw new Error(`HTTP Error Status: ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        if (data.success) {
            gameDetails.name = name;
            gameDetails.desc = desc;
            gameDetails.published = published;
            alert('Game saved and status updated successfully!');
            closePublishModal();
        } else {
            alert('Server reported save failure: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(err => {
        console.error('Save failed:', err);
        alert('Failed to save level: ' + err.message);
    });
}