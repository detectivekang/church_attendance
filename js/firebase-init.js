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

const ADMIN_EMAIL = "kangseabich@naver.com";
