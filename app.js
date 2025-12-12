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
            // Sort Routines too
            currentRoutines.sort((a, b) => {
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
        newRoutineInput.value = '';
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
    displayList.sort((a, b) => {
        // 1. Completion Status (Uncompleted Top)
        const completedA = (a.type === 'todo' && a.data.completed) ? 1 : 0;
        const completedB = (b.type === 'todo' && b.data.completed) ? 1 : 0;
        if (completedA !== completedB) return completedA - completedB;

        // 2. Important (Important Top)
        const impA = a.data.important ? 1 : 0;
        const impB = b.data.important ? 1 : 0;
        if (impA !== impB) return impB - impA;

        // 3. Is Routine (Routine Top)
        const isRoutineA = (a.type === 'routine' || a.data.routineId) ? 1 : 0;
        const isRoutineB = (b.type === 'routine' || b.data.routineId) ? 1 : 0;
        if (isRoutineA !== isRoutineB) return isRoutineB - isRoutineA;

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

    if (isVirtualRoutine) {
        // Virtual Routine Item (Unchecked)
        div.className = `todo-item routine-virtual ${isImportant ? 'important' : ''}`;
        div.innerHTML = `
            <button class="star-btn ${isImportant ? 'active' : ''}" onclick="toggleImportant('${collection}', '${item.id}', ${isImportant})">
                <i class="${isImportant ? 'fas' : 'far'} fa-star"></i>
            </button>
            <div class="checkbox" onclick="checkRoutine('${item.id}', '${item.text}')">
                <i class="fas fa-check"></i>
            </div>
            <div class="todo-content" style="flex:1;">
                <span class="todo-text">${item.text} <small style="color:var(--accent-color); margin-left:5px;">(루틴)</small></span>
                <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">
                    ${formatDays(item.days)}
                </div>
            </div>
        `;
    } else {
        // Real Todo Item
        const routineLabel = item.routineId ? ' <small style="color:var(--accent-color); margin-left:5px;">(루틴)</small>' : '';

        div.className = `todo-item ${item.completed ? 'completed' : ''} ${isImportant ? 'important' : ''}`;
        div.innerHTML = `
            <button class="star-btn ${isImportant ? 'active' : ''}" onclick="toggleImportant('${collection}', '${item.id}', ${isImportant})">
                <i class="${isImportant ? 'fas' : 'far'} fa-star"></i>
            </button>
            <div class="checkbox" onclick="toggleTodo('${item.id}', ${item.completed})">
                <i class="fas fa-check"></i>
            </div>
            <span class="todo-text">${item.text}${routineLabel}</span>
            <button class="delete-btn" onclick="deleteTodo('${item.id}')">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    return div;
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
        li.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span>${routine.text}</span>
                <span style="font-size:0.7rem; color:var(--text-secondary);">${formatDays(routine.days)}</span>
            </div>
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

    routineBtn.addEventListener('click', () => { routineModal.classList.add('active'); });
    closeRoutineBtn.addEventListener('click', () => { routineModal.classList.remove('active'); });
    addRoutineBtn.addEventListener('click', addRoutine);
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
}

// Start
init();
