// studio/editor.js

const canvas = document.getElementById('studioCanvas');
const ctx = canvas.getContext('2d');
const propsPanel = document.getElementById('props-panel');
const contextMenu = document.getElementById('context-menu');

let currentTool = 'select';
let selectedObject = null;
let lastId = 0;

function resizeCanvas() {
    canvas.width = window.innerWidth - 220; // Учитываем панель свойств
    canvas.height = window.innerHeight - 60; // Учитываем тулбар
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- ИНСТРУМЕНТЫ И СОЗДАНИЕ БЛОКОВ ---

function setTool(toolName) {
    // Снимаем активный класс со всех кнопок
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    
    // Устанавливаем новый инструмент
    currentTool = toolName;
    selectedObject = null;
    updatePropertiesPanel();
    
    // Назначаем активный класс кнопке, если это не dropdown
    const toolButton = document.getElementById('tool-' + toolName.split('-')[1]) || document.getElementById('tool-select');
    if (toolButton) {
         if (toolName.startsWith('block-')) {
            // Если выбран блок из dropdown, подсвечиваем кнопку "Add Block"
            document.getElementById('tool-block-dropdown').classList.add('active');
         } else {
             toolButton.classList.add('active');
         }
    }
}

// Привязка кнопок тулбара
document.querySelectorAll('.toolbar > button').forEach(btn => {
    if (btn.dataset.tool) {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    }
});


canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const worldX = x; 
    const worldY = y; 

    const clickedBlock = gameLevel.find(block => 
        worldX >= block.x && worldX <= block.x + block.w &&
        worldY >= block.y && worldY <= block.y + block.h
    );

    if (currentTool.startsWith('block-')) {
        const type = currentTool.split('-')[1];
        lastId++;
        const newBlock = createNewBlock(type, worldX - 50, worldY - 25);
        
        // Заменяем старый спавн, если создан новый
        if (type === 'spawn') {
            const oldSpawn = gameLevel.find(b => b.type === 'spawn');
            if (oldSpawn) gameLevel = gameLevel.filter(b => b.type !== 'spawn');
        }

        gameLevel.push(newBlock);
        selectedObject = newBlock;
        updatePropertiesPanel();
        setTool('select'); // Возврат к курсору
    } else if (clickedBlock) {
        selectedObject = clickedBlock;
        updatePropertiesPanel();
    } else {
        selectedObject = null;
        updatePropertiesPanel();
    }
    
});

function createNewBlock(type, x, y) {
    const commonProps = {
        id: `b-${Date.now()}-${lastId}`,
        x: Math.round(x / 20) * 20, // Привязка к сетке 20x20
        y: Math.round(y / 20) * 20,
        w: 100,
        h: 50,
        opacity: 1,
        collision: true
    };
    
    switch (type) {
        case 'floor':
            return { ...commonProps, type: 'floor', color: '#4c566a' };
        case 'checkpoint':
            return { ...commonProps, type: 'checkpoint', color: '#ebcb8b', w: 10, h: 100, collision: false };
        case 'kill':
            return { ...commonProps, type: 'kill', color: '#bf616a', collision: false };
        case 'finish':
            return { ...commonProps, type: 'finish', color: '#a3be8c', collision: false };
        case 'spawn':
            return { ...commonProps, type: 'spawn', color: '#81a1c1', w: 30, h: 60, collision: false };
        default:
            return { ...commonProps, type: 'floor', color: '#4c566a' };
    }
}

// --- ПАНЕЛЬ СВОЙСТВ ---

function updatePropertiesPanel() {
    if (selectedObject) {
        propsPanel.style.display = 'block';
        document.getElementById('prop-id').innerText = selectedObject.id;
        document.getElementById('prop-type').innerText = selectedObject.type;
        
        document.getElementById('prop-x').value = selectedObject.x;
        document.getElementById('prop-y').value = selectedObject.y;
        document.getElementById('prop-w').value = selectedObject.w;
        document.getElementById('prop-h').value = selectedObject.h;
        document.getElementById('prop-color').value = selectedObject.color;
        document.getElementById('prop-opacity').value = selectedObject.opacity;
        document.getElementById('prop-collision').checked = selectedObject.collision;

        // Отключение нелогичных свойств для Spawn и Checkpoint
        const isTrigger = ['spawn', 'checkpoint', 'kill', 'finish'].includes(selectedObject.type);
        document.getElementById('prop-collision').disabled = isTrigger;
        if (isTrigger) selectedObject.collision = false;

    } else {
        propsPanel.style.display = 'none';
    }
}

// Привязка событий к полям ввода
propsPanel.addEventListener('input', (e) => {
    if (!selectedObject) return;

    switch (e.target.id) {
        case 'prop-x': selectedObject.x = Number(e.target.value); break;
        case 'prop-y': selectedObject.y = Number(e.target.value); break;
        case 'prop-w': selectedObject.w = Number(e.target.value); break;
        case 'prop-h': selectedObject.h = Number(e.target.value); break;
        case 'prop-color': selectedObject.color = e.target.value; break;
        case 'prop-opacity': selectedObject.opacity = Number(e.target.value); break;
        case 'prop-collision': 
            // Только если поле не отключено
            if (!e.target.disabled) selectedObject.collision = e.target.checked; 
            break;
    }
});

// --- КОНТЕКСТНОЕ МЕНЮ И УДАЛЕНИЕ ---

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const clickedBlock = gameLevel.find(block => 
        x >= block.x && x <= block.x + block.w &&
        y >= block.y && y <= block.y + block.h
    );

    if (clickedBlock) {
        selectedObject = clickedBlock;
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
    } else {
        selectedObject = null;
        contextMenu.style.display = 'none';
    }
});

document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
});

function focusOnObject() {
    if (selectedObject) {
        updatePropertiesPanel();
    }
}

function deleteObject() {
    if (selectedObject && selectedObject.type !== 'floor' && selectedObject.type !== 'spawn') {
        gameLevel = gameLevel.filter(b => b.id !== selectedObject.id);
        selectedObject = null;
        updatePropertiesPanel();
        contextMenu.style.display = 'none';
    } else {
        alert('Cannot delete this crucial block.');
    }
}

// --- ОСНОВНОЙ ЦИКЛ ОТРИСОВКИ ---

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    gameLevel.forEach(block => {
        // Установка прозрачности
        ctx.globalAlpha = block.opacity || 1;
        
        ctx.fillStyle = block.color || '#333';
        ctx.fillRect(block.x, block.y, block.w, block.h);

        // Обводка для выбранного объекта
        if (selectedObject && selectedObject.id === block.id) {
            ctx.strokeStyle = '#ebcb8b';
            ctx.lineWidth = 4;
            ctx.strokeRect(block.x, block.y, block.w, block.h);
        }
    });

    ctx.globalAlpha = 1; // Возвращаем прозрачность
}

function loop() {
    draw();
    requestAnimationFrame(loop);
}