// DOM Elements
const currentDateEl = document.getElementById('current-date');
const currentDayEl = document.getElementById('current-day');
const prevBtn = document.getElementById('prev-date');
const nextBtn = document.getElementById('next-date');
const todoListEl = document.getElementById('todo-list');
const emptyStateEl = document.getElementById('empty-state');
const progressFill = document.getElementById('progress-fill');

// Todo Modal Elements
const addBtn = document.getElementById('add-btn');
const modal = document.getElementById('add-modal');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const newTaskInput = document.getElementById('new-task-input');

// Routine Modal Elements
const routineBtn = document.getElementById('routine-btn');
const routineModal = document.getElementById('routine-modal');
const closeRoutineBtn = document.getElementById('close-routine-btn');
const newRoutineInput = document.getElementById('new-routine-input');
const addRoutineBtn = document.getElementById('add-routine-btn');
const routineListEl = document.getElementById('routine-list');

// Data State
let currentDate = new Date();
let currentRoomId = null;
let unsubscribeTodos = null;
let unsubscribeRoutines = null;
let editingId = null; // Track which item is being edited
let isEditingRoutine = false; // Track valid editing mode

// Local Data Cache (for merging)
let currentTodos = [];
let currentRoutines = [];
let sortableInstance = null;
let sortableRoutineInstance = null;

// Initialization
function init() {
    updateDateDisplay();
    setupRoom();
    setupEventListeners();
    setupSortable();

    // Check if Firebase is ready
    if (typeof window.db !== 'undefined') {
        startSubscriptions();
    } else {
        console.log("Waiting for Firebase...");
        setTimeout(() => {
            if (typeof window.db !== 'undefined') {
                startSubscriptions();
            } else {
                alert("경고: Firebase 데이터베이스가 연결되지 않았습니다.\nfirebase-config.js 파일의 설정값을 확인해주세요.");
            }
        }, 1000);
    }
}

function setupSortable() {
    if (sortableInstance) sortableInstance.destroy();
    if (sortableRoutineInstance) sortableRoutineInstance.destroy();

    // Main Todo List Sortable
    sortableInstance = new Sortable(todoListEl, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        delay: 100,
        delayOnTouchOnly: true,
        onEnd: function (evt) {
            saveCustomOrder();
        }
    });

    // Routine List Modal Sortable
    sortableRoutineInstance = new Sortable(routineListEl, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        delay: 100,
        delayOnTouchOnly: true,
        onEnd: function (evt) {
            saveRoutineOrder();
            // Refresh main list to reflect new order immediately
            startSubscriptions();
        }
    });
}

function saveCustomOrder() {
    const orderIds = [];
    const items = todoListEl.querySelectorAll('.todo-item');
    items.forEach(item => {
        orderIds.push(item.getAttribute('data-id'));
    });

    const dateKey = currentDate.toISOString().split('T')[0];
    const storageKey = `todo_order_${currentRoomId}_${dateKey}`;
    localStorage.setItem(storageKey, JSON.stringify(orderIds));
}

function saveRoutineOrder() {
    const orderIds = [];
    const items = routineListEl.querySelectorAll('.routine-item');
    items.forEach(item => {
        orderIds.push(item.getAttribute('data-id'));
    });

    const storageKey = `routine_order_${currentRoomId}`;
    localStorage.setItem(storageKey, JSON.stringify(orderIds));
}

function getCustomOrder() {
    const dateKey = currentDate.toISOString().split('T')[0];
    const storageKey = `todo_order_${currentRoomId}_${dateKey}`;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
}

function getRoutineOrder() {
    const storageKey = `routine_order_${currentRoomId}`;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
}



function startSubscriptions() {
    subscribeTodos();
    subscribeRoutines();
}

// Room Management
function setupRoom() {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');

    if (room) {
        currentRoomId = room;
        localStorage.setItem('daily_todo_room', room);
    } else {
        const storedRoom = localStorage.getItem('daily_todo_room');
        currentRoomId = storedRoom ? storedRoom : generateRoomId();
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + currentRoomId;
        window.history.pushState({ path: newUrl }, '', newUrl);
    }

    console.log(`Joined Room: ${currentRoomId}`);

    // UI 표시
    const roomDisplay = document.getElementById('room-id-display');
    if (roomDisplay) roomDisplay.textContent = currentRoomId;
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 9);
}

// Date Management
function updateDateDisplay() {
    const options = { month: 'long', day: 'numeric' };
    const dayOptions = { weekday: 'long' };
    currentDateEl.textContent = currentDate.toLocaleDateString('ko-KR', options);
    currentDayEl.textContent = currentDate.toLocaleDateString('ko-KR', dayOptions);
}

function changeDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    subscribeTodos(); // Re-subscribe todos (date changed)
    // Routine subscription stays (routines apply to all dates)
}

// Firestore: Todos
function subscribeTodos() {
    if (unsubscribeTodos) unsubscribeTodos();

    const dateKey = currentDate.toISOString().split('T')[0];

    unsubscribeTodos = window.db.collection('todos')
        .where('room', '==', currentRoomId)
        .where('date', '==', dateKey)
        .onSnapshot((snapshot) => {
            currentTodos = [];
            snapshot.forEach(doc => {
                currentTodos.push({ id: doc.id, ...doc.data() });
            });
            // Sort by created time (Oldest Top, Newest Bottom)
            currentTodos.sort((a, b) => {
                const timeA = a.createdAt ? a.createdAt.seconds : Date.now() / 1000;
                const timeB = b.createdAt ? b.createdAt.seconds : Date.now() / 1000;
                return timeA - timeB;
            });
            renderCombinedList();
        }, (error) => {
            console.error("Error fetching todos:", error);
        });
}

// Firestore: Routines
function subscribeRoutines() {
    if (unsubscribeRoutines) unsubscribeRoutines();

    unsubscribeRoutines = window.db.collection('routines')
        .where('room', '==', currentRoomId)
        .onSnapshot((snapshot) => {
            currentRoutines = [];
            snapshot.forEach(doc => {
                currentRoutines.push({ id: doc.id, ...doc.data() });
            });
            // Sort Routines
            const routineOrder = getRoutineOrder();

            currentRoutines.sort((a, b) => {
                if (routineOrder) {
                    const indexA = routineOrder.indexOf(a.id);
                    const indexB = routineOrder.indexOf(b.id);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                }
                // Fallback to creation time
                const timeA = a.createdAt ? a.createdAt.seconds : Date.now() / 1000;
                const timeB = b.createdAt ? b.createdAt.seconds : Date.now() / 1000;
                return timeA - timeB;
            });

            renderRoutineListModal(); // Update Modal List
            renderCombinedList(); // Update Main List
        }, (error) => {
            console.error("Error fetching routines:", error);
        });
}

// Logic: Add/Delete Todo & Routine
async function addTodo(text) {
    if (typeof window.db === 'undefined') return;
    const dateKey = currentDate.toISOString().split('T')[0];
    try {
        await window.db.collection('todos').add({
            text: text,
            completed: false,
            date: dateKey,
            room: currentRoomId,
            important: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        resetModals();
        closeModal();
    } catch (error) {
        alert("저장 에러: " + error.message);
    }
}

async function addRoutine() {
    const text = newRoutineInput.value.trim();
    if (!text) return;
    if (typeof window.db === 'undefined') return;

    // Get selected days
    const selectedDays = [];
    document.querySelectorAll('.weekday-btn[data-day]').forEach(btn => {
        if (btn.classList.contains('selected')) {
            selectedDays.push(parseInt(btn.dataset.day));
        }
    });

    if (selectedDays.length === 0) {
        alert("최소 하루 이상의 요일을 선택해주세요.");
        return;
    }

    try {
        await window.db.collection('routines').add({
            text: text,
            room: currentRoomId,
            days: selectedDays,
            important: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        resetModals();
    } catch (error) {
        alert("루틴 추가 에러: " + error.message);
    }
}

async function checkRoutine(routineId, text) {
    const dateKey = currentDate.toISOString().split('T')[0];
    const originalRoutine = currentRoutines.find(r => r.id === routineId);
    const isImportant = originalRoutine ? (originalRoutine.important || false) : false;

    try {
        await window.db.collection('todos').add({
            text: text,
            completed: true, // Start as completed
            date: dateKey,
            room: currentRoomId,
            routineId: routineId, // Link to routine
            important: isImportant,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error checking routine:", error);
    }
}

async function toggleTodo(id, currentStatus) {
    try {
        const item = currentTodos.find(t => t.id === id);
        if (item && item.routineId && currentStatus === true) {
            // It's a completed routine instance. 
            // If we uncheck it, we should DELETE this instance so it reverts to being a "virtual" uncompleted routine.
            await window.db.collection('todos').doc(id).delete();
        } else {
            // Normal todo or switching to complete (though switching to complete is handled by checkRoutine for virtuals, 
            // this cases handles re-checking a normal todo or a routine instance that somehow stayed?)
            // Actually, routine instances are created when checked. 
            // If we uncheck, we delete. 
            // If we check a normal todo, we update.
            await window.db.collection('todos').doc(id).update({
                completed: !currentStatus
            });
        }
    } catch (error) {
        console.error("Error toggling todo:", error);
    }
}

async function deleteTodo(id) {
    // Direct delete without confirm (Confirm happens via overlay click)
    try {
        await window.db.collection('todos').doc(id).delete();
    } catch (error) {
        console.error("Error deleting todo:", error);
    }
}

async function deleteRoutine(id) {
    // Direct delete without confirm
    try {
        await window.db.collection('routines').doc(id).delete();
    } catch (error) {
        console.error("Error deleting routine:", error);
    }
}


// Interaction Logic
function openModal() {
    modal.classList.add('active');
    newTaskInput.focus();
}

function closeModal() {
    modal.classList.remove('active');
    newTaskInput.value = '';
}


async function toggleImportant(collection, id, currentStatus) {
    if (typeof window.db === 'undefined') return;
    try {
        await window.db.collection(collection).doc(id).update({
            important: !currentStatus
        });
    } catch (error) {
        console.error("Error toggling importance:", error);
    }
}

function renderCombinedList() {
    todoListEl.innerHTML = '';
    const currentDayOfWeek = currentDate.getDay();

    // 1. Identify done routines
    const doneRoutineIds = new Set(
        currentTodos
            .filter(t => t.routineId)
            .map(t => t.routineId)
    );

    // 2. Prepare Unified List
    let displayList = [];

    // 2-1. Add Real Todos
    currentTodos.forEach(todo => {
        let originalRoutineCreatedTime = 0;
        if (todo.routineId) {
            const r = currentRoutines.find(r => r.id === todo.routineId);
            if (r && r.createdAt) originalRoutineCreatedTime = r.createdAt.seconds;
        }

        displayList.push({
            type: 'todo',
            data: todo,
            sortTime: originalRoutineCreatedTime > 0 ? originalRoutineCreatedTime : (todo.createdAt ? todo.createdAt.seconds : 0)
        });
    });

    // 2-2. Add Virtual Routines (Filtered by Day)
    currentRoutines.forEach(routine => {
        if (routine.days && routine.days.length > 0) {
            if (!routine.days.includes(currentDayOfWeek)) return;
        }

        if (!doneRoutineIds.has(routine.id)) {
            displayList.push({
                type: 'routine',
                data: routine,
                sortTime: routine.createdAt ? routine.createdAt.seconds : 0
            });
        }
    });

    // 3. Smart Sort
    const customOrder = getCustomOrder();

    displayList.sort((a, b) => {
        // 0. Use Custom Order if available
        if (customOrder) {
            const indexA = customOrder.indexOf(a.id);
            const indexB = customOrder.indexOf(b.id);

            // If both are in custom order, respect it
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;

            // If one is in custom order and the other is not
            // (New items go to the bottom or top? Let's say top if no order)
            // Actually, if user reordered, they want that specific order.
            // New items usually appear at bottom or top.
            // Let's put pre-ordered items first, new items after.
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
        }

        // 1. Completion Status (Uncompleted Top)
        const completedA = (a.type === 'todo' && a.data.completed) ? 1 : 0;
        const completedB = (b.type === 'todo' && b.data.completed) ? 1 : 0;
        if (completedA !== completedB) return completedA - completedB;

        // 2. Important (Important Top)
        const impA = a.data.important ? 1 : 0;
        const impB = b.data.important ? 1 : 0;
        if (impA !== impB) return impB - impA;

        // 3. Is Routine (Routine Top) -> Sort by Routine Order
        // Use the order from currentRoutines array which is already sorted by getRoutineOrder
        const getRoutineIndex = (item) => {
            const rId = (item.type === 'routine') ? item.data.id : item.data.routineId;
            if (!rId) return 9999;
            const idx = currentRoutines.findIndex(r => r.id === rId);
            return idx === -1 ? 9999 : idx;
        };

        const routineIndexA = getRoutineIndex(a);
        const routineIndexB = getRoutineIndex(b);

        // If both are routines (or linked), sort by routine order
        if (routineIndexA !== 9999 && routineIndexB !== 9999) {
            return routineIndexA - routineIndexB;
        }

        // If one is routine and other is not
        if (routineIndexA !== 9999) return -1;
        if (routineIndexB !== 9999) return 1;

        // 4. Created Time (Oldest Top)
        return a.sortTime - b.sortTime;
    });

    // 4. Render
    if (displayList.length === 0) {
        emptyStateEl.style.display = 'flex';
        progressFill.style.width = '0%';
    } else {
        emptyStateEl.style.display = 'none';

        displayList.forEach(item => {
            if (item.type === 'todo') {
                todoListEl.appendChild(createTodoElement(item.data, false));
            } else {
                todoListEl.appendChild(createTodoElement(item.data, true));
            }
        });

        // 5. Progress Calculation
        let effectiveRoutinesCount = 0;
        currentRoutines.forEach(r => {
            if (!r.days || r.days.length === 0 || r.days.includes(currentDayOfWeek)) {
                effectiveRoutinesCount++;
            }
        });

        const nonRoutineTodosCount = currentTodos.filter(t => !t.routineId).length;
        const totalCount = effectiveRoutinesCount + nonRoutineTodosCount;
        const completedCount = currentTodos.filter(t => t.completed).length;

        const percent = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;
        progressFill.style.width = `${percent}%`;
    }
}

function createTodoElement(item, isVirtualRoutine) {
    const div = document.createElement('div');
    const isImportant = item.important || false;
    const collection = isVirtualRoutine ? 'routines' : 'todos';

    // Set ID for Sortable
    div.setAttribute('data-id', item.id);
    div.setAttribute('data-collection', collection);
    div.className = `todo-item ${!isVirtualRoutine && item.completed ? 'completed' : ''} ${isImportant ? 'important' : ''}`;

    // Common Elements
    const dragHandle = `<div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>`;
    const starBtn = `
        <button class="star-btn ${isImportant ? 'active' : ''}" onclick="toggleImportant('${collection}', '${item.id}', ${isImportant})">
            <i class="${isImportant ? 'fas' : 'far'} fa-star"></i>
        </button>
    `;

    // Only non-routines (and non-completed routine instances) get swipe-to-delete in main list
    // If it has routineId, it's a completed routine instance. User wants these LOCKED (no delete).
    const canSwipe = !isVirtualRoutine && !item.routineId;

    const swipeActions = canSwipe ? `
        <div class="swipe-actions-right">
            <button class="swipe-delete-btn" onclick="deleteTodo('${item.id}')">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    ` : '';

    const contentInner = isVirtualRoutine ? `
            <div class="todo-inner-content">
                ${dragHandle}
                ${starBtn}
                <div class="todo-content" style="flex:1;">
                    <span class="todo-text">${item.text} <small style="color:var(--accent-color); margin-left:5px;">(루틴)</small></span>
                    <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">
                        ${formatDays(item.days)}
                    </div>
                </div>
                <div class="checkbox" onclick="checkRoutine('${item.id}', '${item.text}')">
                    <i class="fas fa-check"></i>
                </div>
            </div>
    ` : `
            ${swipeActions}
            <div class="todo-inner-content">
                ${dragHandle}
                ${starBtn}
                <span class="todo-text">${item.text}</span>
                <div class="checkbox" onclick="toggleTodo('${item.id}', ${item.completed})">
                    <i class="fas fa-check"></i>
                </div>
            </div>
    `;

    div.innerHTML = contentInner;

    // Click text to edit
    const textSpan = div.querySelector('.todo-text');
    if (textSpan) {
        textSpan.style.cursor = 'pointer';
        textSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isVirtualRoutine) {
                openEditRoutineModal(item.id);
            } else {
                openEditTodoModal(item.id);
            }
        });
    }

    // Swipe Logic (Only for real todos, NOT completed routine instances)
    if (canSwipe) {
        attachSwipeListeners(div);
    }

    return div;
}

// Reusable Swipe Logic
function attachSwipeListeners(element) {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;
    const innerContent = element.querySelector('.todo-inner-content');
    if (!innerContent) return;

    // Common Handlers
    const handleStart = (clientX) => {
        startX = clientX;
        isSwiping = true;
        currentX = 0;
        innerContent.style.transition = 'none';
    };

    const handleMove = (clientX) => {
        if (!isSwiping) return;
        const diff = clientX - startX;

        // Limit drag: Only left (negative) up to -100px
        if (diff < 0 && diff > -100) {
            innerContent.style.transform = `translateX(${diff}px)`;
            currentX = diff;
        } else if (diff > 0 && innerContent.classList.contains('swiped')) {
            // Allow closing
            innerContent.style.transform = `translateX(${-70 + diff}px)`;
        }
    };

    const handleEnd = () => {
        if (!isSwiping) return;
        isSwiping = false;
        innerContent.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';

        if (currentX < -40) {
            innerContent.style.transform = `translateX(-70px)`;
            innerContent.classList.add('swiped');

            // Close other swiped items
            document.querySelectorAll('.todo-inner-content.swiped').forEach(el => {
                if (el !== innerContent) {
                    el.style.transform = 'translateX(0)';
                    el.classList.remove('swiped');
                }
            });
        } else {
            innerContent.style.transform = 'translateX(0)';
            innerContent.classList.remove('swiped');
        }
    };

    // Touch Listeners
    element.addEventListener('touchstart', (e) => {
        if (e.target.closest('.checkbox') || e.target.closest('.star-btn') || e.target.closest('.drag-handle') || e.target.closest('.swipe-delete-btn')) return;
        handleStart(e.touches[0].clientX);
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
        handleMove(e.touches[0].clientX);
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
        handleEnd();
    });

    // Mouse Listeners
    element.addEventListener('mousedown', (e) => {
        if (e.target.closest('.checkbox') || e.target.closest('.star-btn') || e.target.closest('.drag-handle') || e.target.closest('.swipe-delete-btn')) return;
        handleStart(e.clientX);
    });

    element.addEventListener('mousemove', (e) => {
        if (e.buttons !== 1) {
            isSwiping = false;
            return;
        }
        handleMove(e.clientX);
    });

    element.addEventListener('mouseup', (e) => {
        handleEnd();
    });

    element.addEventListener('mouseleave', () => {
        if (isSwiping) handleEnd();
    });
}

function formatDays(days) {
    if (!days || days.length === 0 || days.length === 7) return '매일';
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    // Sort logic to show Mon first
    const sortedDays = [...days].sort((a, b) => {
        const da = a === 0 ? 7 : a;
        const db = b === 0 ? 7 : b;
        return da - db;
    });
    return sortedDays.map(d => dayNames[d]).join(', ');
}

function renderRoutineListModal() {
    routineListEl.innerHTML = '';
    currentRoutines.forEach(routine => {
        const li = document.createElement('li');
        li.className = 'routine-item';
        // Add data-id for sortable
        li.setAttribute('data-id', routine.id);

        const swipeActions = `
            <div class="swipe-actions-right">
                <button class="swipe-delete-btn" onclick="deleteRoutine('${routine.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;

        li.innerHTML = `
            ${swipeActions}
            <div class="todo-inner-content">
                <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
                <div class="todo-list-text" style="flex:1; display:flex; flex-direction:column; justify-content:center; cursor:pointer;">
                    <span class="todo-text">${routine.text}</span>
                    <span style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">${formatDays(routine.days)}</span>
                </div>
            </div>
        `;

        li.querySelector('.todo-list-text').addEventListener('click', (e) => {
            e.stopPropagation();
            openEditRoutineModal(routine.id);
        });

        attachSwipeListeners(li);
        routineListEl.appendChild(li);
    });
}

function openEditTodoModal(id) {
    const todo = currentTodos.find(t => t.id === id);
    if (!todo) return;

    editingId = id;
    isEditingRoutine = false;
    newTaskInput.value = todo.text;
    saveBtn.textContent = "수정";
    modal.classList.add('active');
    newTaskInput.focus();
}

function openEditRoutineModal(id) {
    const routine = currentRoutines.find(r => r.id === id);
    if (!routine) return;

    editingId = id;
    isEditingRoutine = true;
    newRoutineInput.value = routine.text;
    addRoutineBtn.textContent = "수정";

    // Set Days
    const days = routine.days || [];
    document.querySelectorAll('.weekday-btn[data-day]').forEach(btn => {
        const day = parseInt(btn.dataset.day);
        if (days.includes(day)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    routineModal.classList.add('active');
    newRoutineInput.focus();
}

async function updateTodo(id, text) {
    try {
        await window.db.collection('todos').doc(id).update({
            text: text,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal();
    } catch (error) {
        console.error("Error updating todo:", error);
        alert("수정 실패: " + error.message);
    }
}

async function updateRoutine(id, text, days) {
    try {
        await window.db.collection('routines').doc(id).update({
            text: text,
            days: days,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Reset Inputs handled by closeRoutineModal or manually here if needed
        newRoutineInput.value = '';
        addRoutineBtn.textContent = '추가';
        editingId = null;
    } catch (error) {
        console.error("Error updating routine:", error);
        alert("루틴 수정 실패: " + error.message);
    }
}

function resetModals() {
    editingId = null;
    isEditingRoutine = false;
    newTaskInput.value = '';
    newRoutineInput.value = '';
    saveBtn.textContent = '저장';
    addRoutineBtn.textContent = '추가';
    document.querySelectorAll('.weekday-btn').forEach(btn => btn.classList.remove('selected'));
}

// Event Listeners
function setupEventListeners() {
    prevBtn.addEventListener('click', () => changeDate(-1));
    nextBtn.addEventListener('click', () => changeDate(1));

    addBtn.addEventListener('click', () => {
        resetModals();
        modal.classList.add('active');
        newTaskInput.focus();
    });
    cancelBtn.addEventListener('click', () => {
        resetModals();
        modal.classList.remove('active');
    });
    saveBtn.addEventListener('click', () => {
        const text = newTaskInput.value.trim();
        if (!text) return;

        if (editingId && !isEditingRoutine) {
            updateTodo(editingId, text);
        } else {
            addTodo(text);
        }
    });
    newTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveBtn.click();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) cancelBtn.click(); });

    routineBtn.addEventListener('click', () => {
        resetModals();
        routineModal.classList.add('active');
    });
    closeRoutineBtn.addEventListener('click', () => {
        resetModals();
        routineModal.classList.remove('active');
    });
    addRoutineBtn.addEventListener('click', () => {
        if (editingId && isEditingRoutine) {
            // Update Logic
            const text = newRoutineInput.value.trim();
            if (!text) return;

            const selectedDays = [];
            document.querySelectorAll('.weekday-btn[data-day]').forEach(btn => {
                if (btn.classList.contains('selected')) {
                    selectedDays.push(parseInt(btn.dataset.day));
                }
            });
            if (selectedDays.length === 0) {
                alert("최소 하루 이상의 요일을 선택해주세요.");
                return;
            }
            updateRoutine(editingId, text, selectedDays);
        } else {
            addRoutine();
        }
    });
    newRoutineInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addRoutine();
    });
    routineModal.addEventListener('click', (e) => { if (e.target === routineModal) closeRoutineBtn.click(); });

    // Weekday Buttons
    const weekdayBtns = document.querySelectorAll('.weekday-btn[data-day]');
    weekdayBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
        });
    });

    // Everyday Button
    const everydayBtn = document.getElementById('everyday-btn');
    if (everydayBtn) {
        everydayBtn.addEventListener('click', () => {
            // Select ALL
            const allSelected = Array.from(weekdayBtns).every(btn => btn.classList.contains('selected'));

            if (allSelected) {
                // Deselect all
                weekdayBtns.forEach(btn => btn.classList.remove('selected'));
            } else {
                // Select all
                weekdayBtns.forEach(btn => btn.classList.add('selected'));
            }
        });
    }

    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                alert("링크가 복사되었습니다! 📋\n(카톡방에 붙여넣으세요)\n\n참고: 다른 기기 접속 시 PC IP 주소(222.238.135.205)가 필요할 수 있습니다.");
            }).catch(err => {
                alert("복사 실패. 주소창을 복사해주세요.");
            });
        });
    }

    window.toggleTodo = toggleTodo;
    window.deleteTodo = deleteTodo;
    window.addTodo = addTodo;
    window.checkRoutine = checkRoutine;
    window.deleteRoutine = deleteRoutine;
    window.toggleImportant = toggleImportant;

    // Global listener to close overlays when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.todo-item')) {
            document.querySelectorAll('.delete-overlay.active').forEach(el => el.classList.remove('active'));
        }
    });
}

// Start
init();
