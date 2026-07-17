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
/* [신규] 교회 설정 - 로고 이미지 업로드용 Firebase Storage */
const storage = firebase.storage();

db.settings({
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
});

const ADMIN_EMAIL = "kangseabich@naver.com";

/* =========================================================
   [신규] 멀티테넌트 - 교회별 데이터는 churches/{currentChurchId}
   아래 서브컬렉션(categories/groups/members/attendance/notices)에
   저장됨. currentChurchId가 정해진 뒤에만 호출해야 함.
   ========================================================= */
function churchCol(name) {
  return db.collection("churches").doc(currentChurchId).collection(name);
}
function churchDocRef() {
  return db.collection("churches").doc(currentChurchId);
}

/* 새 교회에 발급할 가입 코드 (대문자+숫자 6자리, 헷갈리는 0/O/1/I 제외) */
function generateChurchCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
