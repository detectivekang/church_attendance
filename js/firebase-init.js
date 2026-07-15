/* =========================================================
   Firebase 초기화 & 네트워크 통신 방식
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyAwuAjo1_gjvXVU3_pINJPdzqjTlTJDYts",
  authDomain: "churchattendance-398c4.firebaseapp.com",
  projectId: "churchattendance-398c4",
  storageBucket: "churchattendance-398c4.firebasestorage.app",
  messagingSenderId: "867359683786",
  appId: "1:867359683786:web:e3536070246f9944e57033",
  measurementId: "G-N96QSV5EPL",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

const db = firebase.firestore();

db.settings({
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
});

/* [신규] 교회 로고 업로드용 Storage 클라이언트 */
const storage = firebase.storage();

/* [수정] 이제 관리자는 교회마다 따로(churches/{churchId}.adminEmail) 존재하므로
   전역 고정 ADMIN_EMAIL은 더 이상 사용하지 않음 (auth.js의 resolveRole 참고) */
