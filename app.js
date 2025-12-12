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

// Local Data Cache (for merging)
let currentTodos = [];
let currentRoutines = [];

// Initialization
function init() {
    updateDateDisplay();
    setupRoom();
    setupEventListeners();

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
            // Sort by created time
            currentTodos.sort((a, b) => {
                if (!a.createdAt || !b.createdAt) return 0;
                return a.createdAt.seconds - b.createdAt.seconds;
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
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeModal();
    } catch (error) {
        alert("저장 에러: " + error.message);
    }
}

async function addRoutine() {
    const text = newRoutineInput.value.trim();
    if (!text) return;
    if (typeof window.db === 'undefined') return;

    try {
        await window.db.collection('routines').add({
            text: text,
            room: currentRoomId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        newRoutineInput.value = '';
    } catch (error) {
        alert("루틴 추가 에러: " + error.message);
    }
}

async function checkRoutine(routineId, text) {
    // When a virtual routine item is checked, create a real Todo item
    const dateKey = currentDate.toISOString().split('T')[0];
    try {
        await window.db.collection('todos').add({
            text: text,
            completed: true, // Start as completed
            date: dateKey,
            room: currentRoomId,
            routineId: routineId, // Link to routine
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Error checking routine:", error);
    }
}

async function toggleTodo(id, currentStatus) {
    try {
        await window.db.collection('todos').doc(id).update({
            completed: !currentStatus
        });
    } catch (error) {
        console.error("Error toggling todo:", error);
    }
}

async function deleteTodo(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
        await window.db.collection('todos').doc(id).delete();
    } catch (error) {
        console.error("Error deleting todo:", error);
    }
}

async function deleteRoutine(id) {
    if (!confirm('루틴을 삭제하시겠습니까?\n(과거 기록은 유지됩니다)')) return;
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

function renderCombinedList() {
    todoListEl.innerHTML = '';

    // 1. Mark which routines are already done today
    const doneRoutineIds = new Set(
        currentTodos
            .filter(t => t.routineId) // Has routineId
            .map(t => t.routineId)
    );

    // 2. Render Real Todos
    currentTodos.forEach(todo => {
        const el = createTodoElement(todo, false);
        todoListEl.appendChild(el);
    });

    // 3. Render Virtual Routines (only if not done yet)
    currentRoutines.forEach(routine => {
        if (!doneRoutineIds.has(routine.id)) {
            const el = createTodoElement(routine, true);
            todoListEl.appendChild(el);
        }
    });

    // 4. Update Progress (count routines as total items)
    // Total = currentTodos + visible irtual routines
    // Completed = currentTodos.filter(completed)
    // Actually, "Total Tasks for day" = Normal Todos + All Routines (done or not)
    // But if we deleted a todo that originated from routine, it becomes a virtual routine again.
    // So: Total = (Non-routine Todos) + (All Routines)

    const nonRoutineTodos = currentTodos.filter(t => !t.routineId).length;
    const totalCount = nonRoutineTodos + currentRoutines.length;

    // Completed count
    // Real todos completed + Any routine that has a corresponding Real Todo(completed or not? usually completed)
    // Wait, if I uncheck a routine-todo, it stays as a Real Todo but uncompleted.
    // So simple count of all completed Real Todos is enough?
    // No, if I have 3 routines, and I did 1. Real Todo count=1(comp). Virtual=2. Total=3. Progress=33%. Correct.

    const completedCount = currentTodos.filter(t => t.completed).length;

    if (totalCount === 0) {
        if (currentTodos.length === 0 && currentRoutines.length === 0) {
            emptyStateEl.style.display = 'flex';
        } else {
            emptyStateEl.style.display = 'none';
        }
        progressFill.style.width = '0%';
    } else {
        emptyStateEl.style.display = 'none';
        const percent = (completedCount / totalCount) * 100;
        progressFill.style.width = `${percent}%`;
    }
}

function createTodoElement(item, isVirtualRoutine) {
    const div = document.createElement('div');

    if (isVirtualRoutine) {
        // Virtual Routine Item (Unchecked)
        div.className = 'todo-item routine-virtual';
        div.innerHTML = `
            <div class="checkbox" onclick="checkRoutine('${item.id}', '${item.text}')">
                <i class="fas fa-check"></i>
            </div>
            <span class="todo-text">${item.text} <small style="color:var(--accent-color); margin-left:5px;">(루틴)</small></span>
        `;
    } else {
        // Real Todo Item
        div.className = `todo-item ${item.completed ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="checkbox" onclick="toggleTodo('${item.id}', ${item.completed})">
                <i class="fas fa-check"></i>
            </div>
            <span class="todo-text">${item.text}</span>
            <button class="delete-btn" onclick="deleteTodo('${item.id}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    return div;
}

function renderRoutineListModal() {
    routineListEl.innerHTML = '';
    currentRoutines.forEach(routine => {
        const li = document.createElement('li');
        li.className = 'routine-item';
        li.innerHTML = `
            <span>${routine.text}</span>
            <button class="delete-btn" onclick="deleteRoutine('${routine.id}')" style="opacity:1; color:var(--text-secondary);">
                <i class="fas fa-trash"></i>
            </button>
        `;
        routineListEl.appendChild(li);
    });
}

// Event Listeners
function setupEventListeners() {
    prevBtn.addEventListener('click', () => changeDate(-1));
    nextBtn.addEventListener('click', () => changeDate(1));

    // Main Todo Modal
    addBtn.addEventListener('click', () => { modal.classList.add('active'); newTaskInput.focus(); });
    cancelBtn.addEventListener('click', () => { modal.classList.remove('active'); newTaskInput.value = ''; });
    saveBtn.addEventListener('click', () => {
        const text = newTaskInput.value.trim();
        if (text) addTodo(text);
    });
    newTaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveBtn.click();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) cancelBtn.click(); });

    // Routine Modal
    routineBtn.addEventListener('click', () => { routineModal.classList.add('active'); });
    closeRoutineBtn.addEventListener('click', () => { routineModal.classList.remove('active'); });
    addRoutineBtn.addEventListener('click', addRoutine);
    newRoutineInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addRoutine();
    });
    routineModal.addEventListener('click', (e) => { if (e.target === routineModal) closeRoutineBtn.click(); });

    // Share Button
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

    // Global Exposure
    window.toggleTodo = toggleTodo;
    window.deleteTodo = deleteTodo;
    window.addTodo = addTodo;
    window.checkRoutine = checkRoutine;
    window.deleteRoutine = deleteRoutine;
}

// Start
init();
