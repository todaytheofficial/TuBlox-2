// studio/editor.js - ПОЛНОСТЬЮ ОБНОВЛЕНО

const canvas = document.getElementById('studioCanvas');
const ctx = canvas.getContext('2d');
const propsPanel = document.getElementById('props-panel');
const contextMenu = document.getElementById('context-menu');

let currentTool = 'select';
let selectedObject = null;
let lastId = 0;

// --- Состояния для Drag & Drop ---
let isDragging = false;
let isResizing = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
const RESIZE_HANDLE_SIZE = 10; // Размер зоны захвата для изменения размера

function resizeCanvas() {
    canvas.width = window.innerWidth - 220; 
    canvas.height = window.innerHeight - 60; 
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- ИНСТРУМЕНТЫ И СОЗДАНИЕ БЛОКОВ ---

function setTool(toolName) {
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    
    currentTool = toolName;
    
    const toolParts = toolName.split('-');
    const toolKey = toolParts[toolParts.length - 1];

    // Назначаем активный класс кнопке
    if (toolName.startsWith('block-')) {
        document.getElementById('tool-block-dropdown').classList.add('active');
    } else {
        const toolButton = document.getElementById(`tool-${toolKey}`);
        if (toolButton) toolButton.classList.add('active');
    }

    selectedObject = null;
    updatePropertiesPanel();
}

// Привязка кнопок тулбара (убедитесь, что setTool вызывается правильно)
document.querySelectorAll('.toolbar > button').forEach(btn => {
    if (btn.dataset.tool) {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    }
});


function createNewBlock(type, x, y) {
    lastId++;
    const commonProps = {
        id: `b-${Date.now()}-${lastId}`,
        x: Math.round(x / 20) * 20, // Привязка к сетке 20x20
        y: Math.round(y / 20) * 20,
        w: 100,
        h: 50,
        opacity: 1,
        collision: true
    };
    
    // ... (логика типов блоков без изменений)
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
    // ... (логика обновления панели свойств без изменений)
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
            if (!e.target.disabled) selectedObject.collision = e.target.checked; 
            break;
    }
});

// --- ЛОГИКА ПЕРЕМЕЩЕНИЯ (DRAG) и ИЗМЕНЕНИЯ РАЗМЕРА (RESIZE) ---

// Функция для проверки, находится ли курсор в зоне изменения размера
function isCursorInResizeHandle(x, y, obj) {
    return x >= obj.x + obj.w - RESIZE_HANDLE_SIZE &&
           x <= obj.x + obj.w + RESIZE_HANDLE_SIZE &&
           y >= obj.y + obj.h - RESIZE_HANDLE_SIZE &&
           y <= obj.y + obj.h + RESIZE_HANDLE_SIZE;
}

canvas.addEventListener('mousedown', (e) => {
    const x = e.offsetX;
    const y = e.offsetY;

    contextMenu.style.display = 'none';
    
    if (currentTool.startsWith('block-')) {
        // Логика создания нового блока (остается в click, но блокируем drag)
        return;
    }

    const clickedBlock = gameLevel.find(block => 
        x >= block.x && x <= block.x + block.w &&
        y >= block.y && y <= block.y + block.h
    );

    if (clickedBlock) {
        selectedObject = clickedBlock;
        updatePropertiesPanel();

        if (currentTool === 'select' || currentTool === 'resize') {
            
            // Проверка, попали ли в зону изменения размера
            if (currentTool === 'resize' || isCursorInResizeHandle(x, y, selectedObject)) {
                isResizing = true;
                canvas.style.cursor = 'se-resize';
            } else if (currentTool === 'select') {
                // Иначе, начинаем перетаскивание
                isDragging = true;
                dragOffsetX = x - selectedObject.x;
                dragOffsetY = y - selectedObject.y;
                canvas.style.cursor = 'grabbing';
            }
        } else if (currentTool === 'delete') {
             // Сразу удаляем, если выбран инструмент "Delete"
            deleteObject();
            setTool('select');
        }

    } else {
        selectedObject = null;
        updatePropertiesPanel();
    }
});

canvas.addEventListener('mousemove', (e) => {
    const x = e.offsetX;
    const y = e.offsetY;

    // Смена курсора, если выбран объект и мы в зоне изменения размера
    if (selectedObject && currentTool === 'select') {
        if (isCursorInResizeHandle(x, y, selectedObject)) {
            canvas.style.cursor = 'se-resize';
        } else if (!isDragging && !isResizing) {
            canvas.style.cursor = 'default';
        }
    } else if (currentTool === 'resize') {
         canvas.style.cursor = 'se-resize';
    }
    
    if (isDragging && selectedObject) {
        selectedObject.x = Math.round((x - dragOffsetX) / 20) * 20; // Привязка к сетке
        selectedObject.y = Math.round((y - dragOffsetY) / 20) * 20;
        updatePropertiesPanel();
    }

    if (isResizing && selectedObject) {
        let newW = Math.round((x - selectedObject.x) / 20) * 20;
        let newH = Math.round((y - selectedObject.y) / 20) * 20;
        
        // Минимальный размер 20x20
        selectedObject.w = Math.max(20, newW);
        selectedObject.h = Math.max(20, newH);
        
        updatePropertiesPanel();
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    canvas.style.cursor = 'default';
    if (selectedObject) {
        updatePropertiesPanel();
    }
});

// --- ЛОГИКА СОЗДАНИЯ НОВЫХ БЛОКОВ (Click) ---
canvas.addEventListener('click', (e) => {
    // Если мы в режиме Drag/Resize, не создаем новый блок по клику
    if (isDragging || isResizing) return; 

    const x = e.offsetX;
    const y = e.offsetY;

    if (currentTool.startsWith('block-')) {
        const type = currentTool.split('-')[1];
        
        // Проверка, есть ли уже Spawn, чтобы не создавать лишних
        if (type === 'spawn') {
            const oldSpawn = gameLevel.find(b => b.type === 'spawn');
            if (oldSpawn) gameLevel = gameLevel.filter(b => b.type !== 'spawn');
        }
        
        const newBlock = createNewBlock(type, x - 50, y - 25);
        gameLevel.push(newBlock);
        selectedObject = newBlock;
        updatePropertiesPanel();
        setTool('select'); // Возврат к курсору
    } 
    // Если это "select", и мы не выбрали блок в mousedown, то снимаем выделение
    else if (currentTool === 'select' && !selectedObject) {
        // Проверяем еще раз, был ли клик на блоке
        const clickedBlock = gameLevel.find(block => 
            x >= block.x && x <= block.x + block.w &&
            y >= block.y && y <= block.y + block.h
        );
        if (clickedBlock) {
             selectedObject = clickedBlock;
             updatePropertiesPanel();
        } else {
             selectedObject = null;
             updatePropertiesPanel();
        }
    }
});

// --- КОНТЕКСТНОЕ МЕНЮ И УДАЛЕНИЕ ---

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const x = e.offsetX;
    const y = e.offsetY;
    
    const clickedBlock = gameLevel.find(block => 
        x >= block.x && x <= block.x + block.w &&
        y >= block.y && y <= block.y + block.h
    );

    if (clickedBlock) {
        selectedObject = clickedBlock;
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        updatePropertiesPanel();
    } else {
        selectedObject = null;
        contextMenu.style.display = 'none';
        updatePropertiesPanel();
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
    if (selectedObject && selectedObject.type !== 'spawn') {
        gameLevel = gameLevel.filter(b => b.id !== selectedObject.id);
        selectedObject = null;
        updatePropertiesPanel();
        contextMenu.style.display = 'none';
    } else if (selectedObject && selectedObject.type === 'spawn') {
        alert('You cannot delete the Spawn block. Place a new one instead.');
    }
}


// --- ОСНОВНОЙ ЦИКЛ ОТРИСОВКИ ---

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Отрисовка сетки
    ctx.strokeStyle = '#3b4252';
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Отрисовка блоков
    gameLevel.forEach(block => {
        ctx.globalAlpha = block.opacity || 1;
        ctx.fillStyle = block.color || '#333';
        ctx.fillRect(block.x, block.y, block.w, block.h);

        // Обводка для выбранного объекта
        if (selectedObject && selectedObject.id === block.id) {
            ctx.strokeStyle = '#ebcb8b';
            ctx.lineWidth = 4;
            ctx.strokeRect(block.x, block.y, block.w, block.h);
            
            // Рисование ручки для изменения размера, если это не триггер
            if (currentTool === 'resize' || currentTool === 'select' && !['spawn', 'checkpoint', 'kill', 'finish'].includes(block.type)) {
                ctx.fillStyle = '#ebcb8b';
                ctx.fillRect(block.x + block.w - RESIZE_HANDLE_SIZE / 2, 
                             block.y + block.h - RESIZE_HANDLE_SIZE / 2, 
                             RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            }
        }
    });

    ctx.globalAlpha = 1;
    requestAnimationFrame(draw); // Используем requestAnimationFrame для цикла
}

// Запускаем цикл отрисовки
draw();