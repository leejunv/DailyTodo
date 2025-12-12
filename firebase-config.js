const firebaseConfig = {
    apiKey: "AIzaSyCfJImn_cmCVK5rFy1fEY7Z9Pa2IQHpRJE",
    authDomain: "dailytodo-1f13d.firebaseapp.com",
    projectId: "dailytodo-1f13d",
    storageBucket: "dailytodo-1f13d.firebasestorage.app",
    messagingSenderId: "155955479956",
    appId: "1:155955479956:web:17779e6394022fc454bb81"
};

// Initialize Firebase (Compat)
if (typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore(); // 전역 변수 window.db에 할당 (중요!)
        console.log("Firebase Connected Successfully!");
    } catch (e) {
        console.error("Firebase Init Error:", e);
        alert("Firebase 초기화 에러: " + e.message);
    }
} else {
    console.error("Firebase SDK not loaded.");
    alert("Firebase SDK가 로드되지 않았습니다. 새로고침 해주세요.");
}
