const canvas = document.getElementById('studioCanvas');
const ctx = canvas.getContext('2d');
const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('id');

const GRID_SIZE = 50; // Размер сетки
const MIN_SIZE = 20;  // Минимальный размер блока
const SNAP = 5;       // Привязка при перемещении/ресайзе

let levelData = [];
let currentTool = 'select';
let selectedBlock = null;
let isDragging = false;
let isResizing = false;
let dragStartX, dragStartY; // Координаты клика
let dragOffsetX, dragOffsetY; // Смещение курсора внутри блока
let camX = 0, camY = 0;

// --- ИНИЦИАЛИЗАЦИЯ ---

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

async function loadLevel() {
    if (!gameId) {
        alert("Ошибка: Не указан ID игры.");
        return;
    }
    
    const response = await fetch(`/api/get-level/${gameId}`);
    const data = await response.json();
    
    if (data.success) {
        levelData = data.level;
        // Перемещаем камеру, чтобы видеть спавн
        const spawn = levelData.find(b => b.type === 'spawn');
        if (spawn) {
            camX = canvas.width / 2 - spawn.x;
            camY = canvas.height / 2 - spawn.y;
        }
        loop();
    } else {
        alert(data.message);
    }
}

// --- УПРАВЛЕНИЕ ИНСТРУМЕНТАМИ ---

document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Сброс активного класса
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        selectedBlock = null; // Сбрасываем выбор при смене инструмента
        updatePropertiesPanel();
    });
});

document.addEventListener('keydown', (e) => {
    // Горячие клавиши
    const toolMap = { 'v': 'select', 'r': 'resize', 'b': 'block-default', 's': 'block-spawn', 'x': 'delete' };
    const toolId = toolMap[e.key.toLowerCase()];
    
    if (toolId) {
        document.getElementById(`tool-${toolId}`).click();
    }
    
    // Удаление выбранного блока
    if (e.key === 'Delete' && selectedBlock) {
        const index = levelData.indexOf(selectedBlock);
        if (index !== -1) {
            levelData.splice(index, 1);
            selectedBlock = null;
            updatePropertiesPanel();
        }
    }
});


// --- ВЗАИМОДЕЙСТВИЕ МЫШЬЮ ---

canvas.addEventListener('mousedown', (e) => {
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const worldX = e.clientX - camX;
    const worldY = e.clientY - camY;

    // 1. Поиск блока под курсором
    const clickedBlock = levelData.find(b => 
        worldX >= b.x && worldX <= b.x + b.w &&
        worldY >= b.y && worldY <= b.y + b.h
    );

    if (currentTool === 'select') {
        selectedBlock = clickedBlock;
        if (selectedBlock) {
            isDragging = true;
            // Смещение курсора внутри блока
            dragOffsetX = worldX - selectedBlock.x;
            dragOffsetY = worldY - selectedBlock.y;
            updatePropertiesPanel();
        }
    } else if (currentTool === 'resize') {
        // Логика ресайза (только если кликнули на блок)
        selectedBlock = clickedBlock;
        if (selectedBlock) {
            isResizing = true;
            updatePropertiesPanel();
        }
    } else if (currentTool.startsWith('block-')) {
        // Создание блока (Spawn Block только один!)
        if (currentTool === 'block-spawn' && levelData.some(b => b.type === 'spawn')) {
             alert("На уровне может быть только один Spawn Block!");
             return;
        }

        const newBlock = {
            x: Math.round(worldX / GRID_SIZE) * GRID_SIZE,
            y: Math.round(worldY / GRID_SIZE) * GRID_SIZE,
            w: GRID_SIZE,
            h: GRID_SIZE,
            type: currentTool === 'block-spawn' ? 'spawn' : 'default',
            color: currentTool === 'block-spawn' ? '#bf616a' : '#5e81ac' 
        };
        levelData.push(newBlock);
        selectedBlock = newBlock;
        updatePropertiesPanel();
        isResizing = true; // Сразу переходим в режим изменения размера
    } else if (currentTool === 'delete') {
         if (clickedBlock) {
             const index = levelData.indexOf(clickedBlock);
             if (index !== -1) levelData.splice(index, 1);
             selectedBlock = null;
             updatePropertiesPanel();
         }
    }
});

canvas.addEventListener('mousemove', (e) => {
    const worldX = e.clientX - camX;
    const worldY = e.clientY - camY;

    if (isDragging && selectedBlock) {
        // Инструмент "Выбрать/Двигать"
        let newX = worldX - dragOffsetX;
        let newY = worldY - dragOffsetY;
        
        // Привязка к сетке (Grid Snapping)
        selectedBlock.x = Math.round(newX / SNAP) * SNAP;
        selectedBlock.y = Math.round(newY / SNAP) * SNAP;
        updatePropertiesPanel(true);
    } else if (isResizing && selectedBlock) {
        // Инструмент "Масштабировать"
        let newW = Math.max(MIN_SIZE, worldX - selectedBlock.x);
        let newH = Math.max(MIN_SIZE, worldY - selectedBlock.y);
        
        // Привязка к сетке
        selectedBlock.w = Math.round(newW / SNAP) * SNAP;
        selectedBlock.h = Math.round(newH / SNAP) * SNAP;
        updatePropertiesPanel(true);
    } else {
        // Движение камерой (колесо мыши или средняя кнопка)
        if (e.buttons === 4 || e.buttons === 1 && currentTool === 'select' && !selectedBlock) {
            camX += e.clientX - dragStartX;
            camY += e.clientY - dragStartY;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
        }
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    updatePropertiesPanel(); // Обновить окончательные значения
});


// --- ПАНЕЛЬ СВОЙСТВ ---

const propInputs = {
    x: document.getElementById('prop-x'),
    y: document.getElementById('prop-y'),
    w: document.getElementById('prop-w'),
    h: document.getElementById('prop-h'),
    color: document.getElementById('prop-color')
};

function updatePropertiesPanel(duringDrag = false) {
    const panel = document.getElementById('props-panel');
    
    if (!selectedBlock) {
        panel.style.opacity = 0.5;
        panel.style.pointerEvents = 'none';
        document.getElementById('prop-id').innerText = 'None';
        document.getElementById('prop-type').innerText = 'None';
        return;
    }
    
    panel.style.opacity = 1;
    panel.style.pointerEvents = 'auto';

    document.getElementById('prop-id').innerText = selectedBlock.id || 'New';
    document.getElementById('prop-type').innerText = selectedBlock.type.toUpperCase();

    // Обновляем поля ввода
    if (!duringDrag) {
        propInputs.x.value = Math.round(selectedBlock.x);
        propInputs.y.value = Math.round(selectedBlock.y);
        propInputs.w.value = Math.round(selectedBlock.w);
        propInputs.h.value = Math.round(selectedBlock.h);
        propInputs.color.value = selectedBlock.color || '#5e81ac';
    }
}

// Слушатели для ручного ввода
Object.keys(propInputs).forEach(key => {
    propInputs[key].addEventListener('change', (e) => {
        if (selectedBlock) {
            // Преобразование в число для W, H, X, Y
            if (key !== 'color') {
                selectedBlock[key] = parseFloat(e.target.value);
            } else {
                selectedBlock[key] = e.target.value;
            }
        }
    });
});


// --- ЦИКЛ РЕНДЕРИНГА ---

function drawGrid() {
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;

    // Определение видимой области
    const startX = Math.floor((-camX) / GRID_SIZE) * GRID_SIZE;
    const endX = startX + canvas.width + GRID_SIZE;
    const startY = Math.floor((-camY) / GRID_SIZE) * GRID_SIZE;
    const endY = startY + canvas.height + GRID_SIZE;

    // Рисуем вертикальные линии
    for (let x = startX; x < endX; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x + camX, 0);
        ctx.lineTo(x + camX, canvas.height);
        ctx.stroke();
    }

    // Рисуем горизонтальные линии
    for (let y = startY; y < endY; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y + camY);
        ctx.lineTo(canvas.width, y + camY);
        ctx.stroke();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camX, camY);
    
    drawGrid();

    // Рисуем блоки
    levelData.forEach(block => {
        ctx.fillStyle = block.color || '#5e81ac';
        
        // Визуальное отличие Spawn Block
        if (block.type === 'spawn') {
            ctx.fillStyle = '#bf616a';
            ctx.globalAlpha = 0.7; // Сделать полупрозрачным
            ctx.fillRect(block.x, block.y, block.w, block.h);
            ctx.globalAlpha = 1.0;
            
            // Нарисуем "человечка" для наглядности спавна
            ctx.fillStyle = 'white';
            ctx.font = 'bold 30px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👤', block.x + block.w / 2, block.y + block.h / 2 + 10);
            
        } else {
            // Обычный блок
            ctx.fillRect(block.x, block.y, block.w, block.h);
        }

        // Выделение выбранного блока
        if (selectedBlock === block) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 3;
            ctx.strokeRect(block.x, block.y, block.w, block.h);
        }
    });

    ctx.restore();
}

function loop() {
    draw();
    requestAnimationFrame(loop);
}


// --- СОХРАНЕНИЕ ---

async function saveMap() {
    const levelName = prompt("Введите новое название для игры (Оставьте пустым, чтобы не менять):");
    const gameDetails = {};
    if (levelName) {
        gameDetails.name = levelName;
    }
    
    // Очищаем блоки от лишних свойств перед отправкой
    const cleanedLevel = levelData.map(b => ({
        x: Math.round(b.x), y: Math.round(b.y), 
        w: Math.round(b.w), h: Math.round(b.h), 
        type: b.type, color: b.color 
    }));
    
    const response = await fetch(`/api/save-level/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelData: cleanedLevel, gameDetails })
    });
    
    const data = await response.json();
    if (data.success) {
        alert("Уровень успешно сохранен и опубликован!");
    } else {
        alert("Ошибка сохранения: " + data.message);
    }
}

window.saveMap = saveMap; // Делаем функцию доступной из HTML

loadLevel(); // Запускаем загрузку уровня