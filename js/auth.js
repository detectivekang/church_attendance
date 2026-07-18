/* =========================================================
   인증 처리
   ========================================================= */
document.getElementById("loginBtn").addEventListener("click", async () => {
  const emailEl = document.getElementById("loginEmail");
  const pwEl = document.getElementById("loginPassword");
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!markRequired([emailEl, pwEl])) {
    errEl.textContent = "이메일과 비밀번호를 입력하세요.";
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(emailEl.value.trim(), pwEl.value);
  } catch (e) {
    errEl.textContent = translateAuthError(e);
  }
});

/* =========================================================
   [수정] 회원가입 - 이메일/비밀번호는 상단(loginEmail/loginPassword)의
   값을 공용으로 쓰고, "교회 가입" / "일반 가입" 중 하나를 선택해
   이름(+교회 이름 또는 교회 코드)만 추가로 입력받는 구조.
   (예전에는 존재하지 않는 #signupBtn/#signupName을 참조해
   auth.js 전체가 로드 시점에 오류로 멈춰버렸던 문제를 함께 해결함)
   ========================================================= */
const churchSignupBox = document.getElementById("churchSignupBox");
const regularSignupBox = document.getElementById("regularSignupBox");
const showChurchSignupBtn = document.getElementById("showChurchSignupBtn");
const showRegularSignupBtn = document.getElementById("showRegularSignupBtn");

function closeSignupBoxes() {
  churchSignupBox.style.display = "none";
  regularSignupBox.style.display = "none";
  showChurchSignupBtn.classList.remove("active");
  showRegularSignupBtn.classList.remove("active");
}

showChurchSignupBtn.addEventListener("click", () => {
  const opening = churchSignupBox.style.display === "none";
  closeSignupBoxes();
  document.getElementById("loginError").textContent = "";
  if (opening) {
    churchSignupBox.style.display = "block";
    showChurchSignupBtn.classList.add("active");
    document.getElementById("churchSignupName").focus();
  }
});

showRegularSignupBtn.addEventListener("click", () => {
  const opening = regularSignupBox.style.display === "none";
  closeSignupBoxes();
  document.getElementById("loginError").textContent = "";
  if (opening) {
    regularSignupBox.style.display = "block";
    showRegularSignupBtn.classList.add("active");
    document.getElementById("regularSignupName").focus();
  }
});

/* [신규] 운영자가 공유한 가입 링크(?code=XXXXXX)로 들어온 경우,
   일반 가입 화면을 자동으로 열고 교회 코드를 미리 채워줌 */
(function applySharedChurchCodeFromUrl() {
  const sharedCode = new URLSearchParams(location.search).get("code");
  if (!sharedCode) return;
  document.getElementById("regularSignupCode").value = sharedCode
    .trim()
    .toUpperCase();
  regularSignupBox.style.display = "block";
  showRegularSignupBtn.classList.add("active");
  document.getElementById("regularSignupName").focus();
  /* 새로고침해도 계속 남아있지 않도록 주소창의 쿼리스트링만 정리 */
  history.replaceState(null, "", location.pathname);
})();

/* 필수 입력칸이 비어있으면 빨간 테두리로 표시하고 첫 번째 빈 칸에 포커스.
   반환값: 모두 채워져 있으면 true */
function markRequired(fields) {
  let firstInvalid = null;
  fields.forEach((el) => {
    const empty = !el.value.trim();
    el.classList.toggle("input-invalid", empty);
    if (empty && !firstInvalid) firstInvalid = el;
  });
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}
[
  "loginEmail",
  "loginPassword",
  "churchSignupName",
  "churchSignupChurchName",
  "churchSignupAddress",
  "churchSignupAddressDetail",
  "churchSignupDenominationEtc",
  "regularSignupName",
  "regularSignupCode",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", (e) => {
    if (e.target.value.trim()) e.target.classList.remove("input-invalid");
  });
});

/* [신규] 다음(Daum) 우편번호 검색 - 도로명주소 + 우편번호를 받아와 채워넣음 */
document
  .getElementById("churchSignupAddressSearchBtn")
  .addEventListener("click", () => {
    if (typeof daum === "undefined" || !daum.Postcode) {
      alert("주소 검색 기능을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new daum.Postcode({
      oncomplete: function (data) {
        document.getElementById("churchSignupAddress").value =
          data.roadAddress || data.jibunAddress;
        document.getElementById("churchSignupZonecode").value = data.zonecode;
        document.getElementById("churchSignupAddress").classList.remove(
          "input-invalid",
        );
        document.getElementById("churchSignupAddressDetail").focus();
      },
    }).open();
  });

/* [신규] 교단 선택에서 "기타" 선택 시에만 직접입력 칸을 보여줌 */
document
  .getElementById("churchSignupDenomination")
  .addEventListener("change", (e) => {
    const etcEl = document.getElementById("churchSignupDenominationEtc");
    etcEl.style.display = e.target.value === "기타" ? "block" : "none";
    if (e.target.value !== "기타") {
      etcEl.value = "";
      etcEl.classList.remove("input-invalid");
    }
  });

/* [신규] 이용약관/개인정보 동의 체크박스가 둘 다 체크됐는지 확인.
   안 됐으면 해당 행을 빨갛게 표시하고 에러 메시지를 채워줌 */
function checkConsents(termsCbId, privacyCbId, errEl) {
  const termsCb = document.getElementById(termsCbId);
  const privacyCb = document.getElementById(privacyCbId);
  const termsRow = termsCb.closest(".consent-row");
  const privacyRow = privacyCb.closest(".consent-row");
  termsRow.classList.toggle("input-invalid", !termsCb.checked);
  privacyRow.classList.toggle("input-invalid", !privacyCb.checked);
  if (!termsCb.checked || !privacyCb.checked) {
    errEl.textContent = "이용약관과 개인정보 수집·이용에 모두 동의해야 가입할 수 있습니다.";
    return false;
  }
  return true;
}
[
  ["churchConsentTerms", "churchConsentPrivacy"],
  ["regularConsentTerms", "regularConsentPrivacy"],
].forEach(([termsCbId, privacyCbId]) => {
  [termsCbId, privacyCbId].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      e.target.closest(".consent-row").classList.remove("input-invalid");
    });
  });
});

/* [신규] 이용약관 / 개인정보 처리방침 보기 모달 */
function openLegalModal(overlayId) {
  document.getElementById(overlayId).style.display = "flex";
}
function closeLegalModal(overlayId) {
  document.getElementById(overlayId).style.display = "none";
}
document.querySelectorAll("[data-open-terms]").forEach((el) => {
  el.addEventListener("click", () => openLegalModal("termsModalOverlay"));
});
document.querySelectorAll("[data-open-privacy]").forEach((el) => {
  el.addEventListener("click", () => openLegalModal("privacyModalOverlay"));
});
document.getElementById("closeTermsModalBtn").addEventListener("click", () => {
  closeLegalModal("termsModalOverlay");
});
document
  .getElementById("closePrivacyModalBtn")
  .addEventListener("click", () => closeLegalModal("privacyModalOverlay"));
document.getElementById("termsModalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "termsModalOverlay") closeLegalModal("termsModalOverlay");
});
document
  .getElementById("privacyModalOverlay")
  .addEventListener("click", (e) => {
    if (e.target.id === "privacyModalOverlay")
      closeLegalModal("privacyModalOverlay");
  });

/* 이메일/비밀번호 공통 검증 (형식 체크는 Firebase가 최종적으로 해줌) */
function validateEmailPw(errEl) {
  const emailEl = document.getElementById("loginEmail");
  const pwEl = document.getElementById("loginPassword");
  if (!markRequired([emailEl, pwEl])) {
    errEl.textContent = "이메일과 비밀번호를 입력하세요.";
    return null;
  }
  const pw = pwEl.value;
  if (pw.length < 6) {
    pwEl.classList.add("input-invalid");
    errEl.textContent = "비밀번호는 6자 이상이어야 합니다.";
    pwEl.focus();
    return null;
  }
  return { email: emailEl.value.trim(), pw };
}

document
  .getElementById("churchSignupBtn")
  .addEventListener("click", async () => {
    const errEl = document.getElementById("churchSignupError");
    errEl.textContent = "";
    const nameEl = document.getElementById("churchSignupName");
    const churchNameEl = document.getElementById("churchSignupChurchName");
    const addressEl = document.getElementById("churchSignupAddress");
    const addressDetailEl = document.getElementById(
      "churchSignupAddressDetail",
    );
    const denomEl = document.getElementById("churchSignupDenomination");
    const denomEtcEl = document.getElementById("churchSignupDenominationEtc");
    const pastorEl = document.getElementById("churchSignupPastor");
    if (!markRequired([nameEl, churchNameEl, addressEl, addressDetailEl])) {
      errEl.textContent =
        "이름 · 교회 이름 · 주소를 모두 입력하세요. (주소는 '주소 검색' 버튼으로 검색해주세요)";
      return;
    }
    if (denomEl.value === "기타" && !markRequired([denomEtcEl])) {
      errEl.textContent = "교단명을 직접 입력해주세요.";
      return;
    }
    if (!checkConsents("churchConsentTerms", "churchConsentPrivacy", errEl)) {
      return;
    }
    const cred = validateEmailPw(errEl);
    if (!cred) return;
    const btn = document.getElementById("churchSignupBtn");
    btn.disabled = true;
    btn.textContent = "확인 중...";
    try {
      /* [수정] 슈퍼관리자 승인 절차 제거 - 대신 교회 이름 중복 여부를 먼저 확인함.
         공백 유무/대소문자 차이로 인한 중복 등록을 막기 위해 nameKey(공백 제거 + 소문자)로 비교.
         [신규] 전국에 같은 이름의 교회가 여러 곳 있을 수 있으므로, 이름만으로는
         막지 않고 이름+주소(우편번호+상세주소)가 완전히 같을 때만 차단함. 이름은
         같은데 주소가 다르면 "다른 교회가 맞는지" 한 번 확인만 받고 진행시킴 */
      const churchName = churchNameEl.value.trim();
      const nameKey = churchName.replace(/\s+/g, "").toLowerCase();
      const addressDetail = addressDetailEl.value.trim();
      const addressKey = `${addressEl.value.trim()} ${addressDetail}`
        .replace(/\s+/g, "")
        .toLowerCase();
      const dupSnap = await db
        .collection("churches")
        .where("nameKey", "==", nameKey)
        .get();
      if (!dupSnap.empty) {
        const exactDup = dupSnap.docs.some((d) => d.data().addressKey === addressKey);
        if (exactDup) {
          errEl.textContent = "이미 같은 이름·주소로 등록된 교회입니다.";
          churchNameEl.classList.add("input-invalid");
          btn.disabled = false;
          btn.textContent = "교회 가입 완료";
          return;
        }
        const proceed = window.confirm(
          `'${churchName}'이라는 이름의 교회가 이미 등록되어 있습니다.\n주소가 다른 별개의 교회가 맞다면 계속 진행해주세요.`,
        );
        if (!proceed) {
          btn.disabled = false;
          btn.textContent = "교회 가입 완료";
          return;
        }
      }

      btn.textContent = "가입 처리 중...";
      /* [수정] 계정 생성 시점부터 우리가 직접 routeAfterAuth를 호출해
         최종 라우팅을 마칠 때까지, onAuthStateChanged의 자동 라우팅을 막음 */
      suppressAutoRoute = true;
      /* [수정] 실패 시 정확히 어느 단계에서 막혔는지 알 수 있도록 태깅.
         "Missing or insufficient permissions"만으로는 어느 문서 쓰기가
         거부됐는지 알 수 없어서, 각 단계를 stage에 기록해두고 catch에서
         함께 표시함 */
      let stage = "계정 생성";
      try {
        await auth.createUserWithEmailAndPassword(cred.email, cred.pw);
        /* [수정] 계정 생성 직후 곧바로 Firestore 쓰기를 보내면, 새로
           발급된 로그인 토큰이 아직 Firestore 클라이언트에 반영되기 전이라
           "로그인 안 한 사용자"로 취급되어 permission-denied가 나는 경우가
           있음 - 토큰을 강제로 새로 받아온 뒤 다음 단계로 진행해 이 레이스
           컨디션을 없앰 */
        await auth.currentUser.getIdToken(true);

        stage = "교회 문서 생성";
        /* [수정] 승인 대기 없이 바로 생성되도록 status를 처음부터 "approved"로 저장.
           roles 문서 생성 규칙이 exists(교회 문서)를 검사하는데, Firestore 보안
           규칙은 같은 batch/트랜잭션 안에서 함께 쓰는 다른 문서를 아직 "존재하지
           않는" 상태로 보고 검사하므로, 교회 문서는 이렇게 따로 먼저 확정지어야
           바로 아래 batch에서 roles 문서의 exists() 검사가 통과함 */
        const churchRef = await db.collection("churches").add({
          name: churchName,
          nameKey,
          code: generateChurchCode(),
          status: "approved",
          plan: "free",
          ownerEmail: cred.email,
          createdAt: Date.now(),
          /* [신규] 주소/교단/담임목사 - 동명 교회 구분 및 기본 정보 */
          address: addressEl.value.trim(),
          addressDetail,
          zonecode: document.getElementById("churchSignupZonecode").value,
          addressKey,
          denomination:
            denomEl.value === "기타" ? denomEtcEl.value.trim() : denomEl.value,
          pastorName: pastorEl.value.trim() || null,
        });

        stage = "사용자/역할 문서 생성";
        /* [수정] 이전에는 사용자 문서 → 역할 문서를 각각 따로 await로 썼는데,
           역할 문서 쓰기만 실패해도 사용자 문서는 이미 만들어진 "반쪽짜리
           계정"이 생겨버렸음. 그러면 이 계정은 이후 로그인할 때마다 역할
           문서가 없어서 initRoleView()가 계속 "승인 대기 중" 화면으로
           떨어지는 문제가 있었음(권한없음처럼 보임). 이제 이 둘은 batch로
           묶어 항상 같이 성공하거나 같이 실패하도록 함(부분 실패로 인한
           반쪽짜리 상태 자체를 없앰) */
        const userRef = db.collection("users").doc(cred.email);
        const rolesRef = db.collection("roles").doc(cred.email);
        const batch = db.batch();
        batch.set(userRef, {
          email: cred.email,
          name: nameEl.value.trim(),
          createdAt: Date.now(),
          churchId: churchRef.id,
          /* [신규] 회원가입 시 이용약관/개인정보 동의 여부·시각 기록 (분쟁 대비 증빙) */
          agreedTermsAt: Date.now(),
          agreedPrivacyAt: Date.now(),
        });
        /* [수정] 이전에는 기본 카테고리를 자동 생성하고 그 카테고리의
           운영자(operator) 컨텍스트까지 함께 부여했는데, roles 문서에 컨텍스트가
           2개(admin + operator)가 되면서 "역할이 여러 개일 때 먼저 보여주는
           역할 선택 화면" 분기를 타버렸고, 그 갈림길에서 결국 역할 없음으로
           오인되어 "권한 승인 대기 중입니다" 화면에 머무는 문제가 있었음.
           애초에 "admin"(운영자) 역할 하나만으로도 카테고리 관리 권한은 이미
           충분하므로(로그인 즉시 카테고리 관리 화면으로 진입), 불필요한 카테고리
           자동 생성과 이중 역할 부여를 없애고 컨텍스트를 1개로 단순화함 */
        batch.set(rolesRef, {
          contexts: [{ role: "admin", churchId: churchRef.id }],
          churchIds: [churchRef.id],
          approvedChurchIds: [churchRef.id],
        });
        await batch.commit();

        stage = "화면 진입(라우팅)";
        /* 문서 작성이 모두 끝난 지금 시점 기준으로 라우팅을 명시적으로 실행 */
        await routeAfterAuth(auth.currentUser);
      } finally {
        suppressAutoRoute = false;
      }
    } catch (e) {
      /* [수정] 이미 화면이 앱 화면으로 넘어가 로그인 화면(및 errEl)이
         가려져 있을 수 있으므로, alert로도 함께 알려서 실패가 조용히
         묻히지 않도록 함. 어느 단계(stage)에서 실패했는지도 함께 표시 */
      const msg = `[${stage}] ` + translateAuthError(e);
      errEl.textContent = msg;
      alert("교회 가입 처리 중 문제가 발생했습니다: " + msg);
      console.error("교회 가입 실패 - stage:", stage, e);
      btn.disabled = false;
      btn.textContent = "교회 가입 완료";
    }
  });

document
  .getElementById("regularSignupBtn")
  .addEventListener("click", async () => {
    const errEl = document.getElementById("regularSignupError");
    errEl.textContent = "";
    const nameEl = document.getElementById("regularSignupName");
    const codeEl = document.getElementById("regularSignupCode");
    if (!markRequired([nameEl, codeEl])) {
      errEl.textContent = "이름과 교회 코드를 모두 입력하세요.";
      return;
    }
    if (!checkConsents("regularConsentTerms", "regularConsentPrivacy", errEl)) {
      return;
    }
    const cred = validateEmailPw(errEl);
    if (!cred) return;
    const btn = document.getElementById("regularSignupBtn");
    btn.disabled = true;
    btn.textContent = "확인 중...";
    try {
      /* 계정을 만들기 전에 먼저 교회 코드가 유효한지 확인 (잘못된 코드로
         계정만 생성되고 어느 교회에도 속하지 못하는 상황 방지) */
      const code = codeEl.value.trim().toUpperCase();
      const churchSnap = await db
        .collection("churches")
        .where("code", "==", code)
        .limit(1)
        .get();
      if (churchSnap.empty) {
        errEl.textContent = "유효하지 않은 교회 코드입니다.";
        codeEl.classList.add("input-invalid");
        return;
      }
      const churchDoc = churchSnap.docs[0];
      if (churchDoc.data().status !== "approved") {
        errEl.textContent = "해당 교회는 아직 승인 대기 중입니다.";
        return;
      }
      btn.textContent = "가입 처리 중...";
      suppressAutoRoute = true;
      try {
        await auth.createUserWithEmailAndPassword(cred.email, cred.pw);
        /* [수정] 계정 생성 직후 토큰이 아직 반영되기 전에 쓰기가 나가
           permission-denied가 나는 레이스 컨디션 방지 (교회 가입과 동일) */
        await auth.currentUser.getIdToken(true);
        /* [수정] 이전에는 users 문서만 만들고 roles 문서를 아예 만들지
           않았음. 그러면 이 사람의 roles/{email} 문서가 존재하지 않는
           상태가 되고, 나중에 운영자/그룹장이 이 사람에게 "최초로" 그룹장
           또는 팀장 역할을 주려는 시도가 Firestore 입장에서는 update가
           아니라 create가 되어버림 - roles 컬렉션의 create 규칙은 "본인이
           본인 문서를 만드는 경우"만 허용하므로 남이 만들려는 이 create는
           항상 거부됨(권한 없음 오류). 교회 가입과 동일하게 users 문서와
           함께 role:"none" roles 문서를 batch로 같이 만들어 이 구멍을 없앰 */
        const userRef = db.collection("users").doc(cred.email);
        const rolesRef = db.collection("roles").doc(cred.email);
        const batch = db.batch();
        batch.set(userRef, {
          email: cred.email,
          name: nameEl.value.trim(),
          createdAt: Date.now(),
          churchId: churchDoc.id,
          /* [신규] 회원가입 시 이용약관/개인정보 동의 여부·시각 기록 (분쟁 대비 증빙) */
          agreedTermsAt: Date.now(),
          agreedPrivacyAt: Date.now(),
        });
        batch.set(rolesRef, {
          contexts: [{ role: "none", churchId: churchDoc.id }],
          churchIds: [churchDoc.id],
          approvedChurchIds: [],
        });
        await batch.commit();
        /* 문서 작성이 모두 끝난 뒤 명시적으로 라우팅 */
        await routeAfterAuth(auth.currentUser);
      } finally {
        suppressAutoRoute = false;
      }
    } catch (e) {
      errEl.textContent = translateAuthError(e);
      alert("가입 처리 중 문제가 발생했습니다: " + translateAuthError(e));
      console.error("일반 가입 실패:", e);
    } finally {
      btn.disabled = false;
      btn.textContent = "가입 완료";
    }
  });

document
  .getElementById("logoutBtn")
  .addEventListener("click", () => auth.signOut());

/* =========================================================
   [신규] 비밀번호를 잊었을 때 - 가입 이메일로 재설정 링크 발송
   ========================================================= */
document.getElementById("forgotPwLink").addEventListener("click", () => {
  const box = document.getElementById("forgotPwBox");
  const opening = box.style.display === "none";
  box.style.display = opening ? "block" : "none";
  document.getElementById("forgotPwMsg").textContent = "";
  if (opening) {
    const emailInput = document.getElementById("forgotPwEmail");
    emailInput.value = document.getElementById("loginEmail").value.trim();
    emailInput.focus();
  }
});

document
  .getElementById("forgotPwSendBtn")
  .addEventListener("click", async () => {
    const btn = document.getElementById("forgotPwSendBtn");
    const msgEl = document.getElementById("forgotPwMsg");
    const email = document.getElementById("forgotPwEmail").value.trim();
    if (!email) {
      msgEl.textContent = "이메일을 입력하세요.";
      return;
    }
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "전송 중...";
    try {
      await auth.sendPasswordResetEmail(email);
      msgEl.textContent =
        "재설정 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해주세요.";
    } catch (e) {
      msgEl.textContent = translateAuthError(e);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

function translateAuthError(e) {
  const map = {
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/user-not-found": "등록되지 않은 이메일입니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해주세요.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  };
  return map[e.code] || "오류: " + e.message;
}

/* extra: 회원가입 시 함께 반영할 부가 필드 (예: churchId) */
async function ensureUserDoc(user, name, extra) {
  try {
    const ref = db.collection("users").doc(user.email);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        email: user.email,
        name: name || "",
        createdAt: Date.now(),
        ...(extra || {}),
      });
      return name || "";
    } else if (name && !doc.data().name) {
      await ref.update({ name, ...(extra || {}) });
      return name;
    }
    return doc.data().name || "";
  } catch (e) {
    /* 유저 정보 저장/조회 실패는 앱 진행에 영향 없도록 무시 (헤더엔 이메일로 대체 표시) */
    return "";
  }
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    document.getElementById("userEmailLabel").textContent = user.email;
    /* [수정] 회원가입 처리 중이면(아직 교회/역할 문서 작성이 끝나지 않았으면)
       여기서 자동으로 라우팅하지 않음 - 회원가입 함수가 문서 작성을 모두
       마친 뒤 직접 routeAfterAuth를 호출해 최종 화면을 결정함 */
    if (!suppressAutoRoute) {
      await routeAfterAuth(user);
    }
  } else {
    currentUser = null;
    currentRole = null;
    roleScope = {};
    userContexts = [];
    activeContextIndex = 0;
    currentChurchId = null;
    currentChurchData = null;
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appScreen").style.display = "none";
  }
});

/* [신규] 로그인 상태 진입 시 화면 라우팅.
   [수정] onAuthStateChanged 안에만 있으면, 회원가입 직후 여기 로직이
   "교회/역할 문서를 아직 만들기 전" 타이밍에 먼저 실행돼버리는 경합이
   있었음(Firebase가 계정 생성과 거의 동시에 onAuthStateChanged를 발생시켜서,
   가입 처리 함수가 교회 문서를 만들기도 전에 이 라우팅이 먼저 돔 -> 역할이
   없다고 판단해 "권한 승인 대기" 화면이 그대로 굳어버림). 그래서 함수로
   분리해 회원가입 처리가 모든 문서 작성을 끝낸 뒤 명시적으로 다시
   호출해 최신 상태로 재라우팅할 수 있게 함. */
async function routeAfterAuth(user) {
  const userName = await ensureUserDoc(user);
  document.getElementById("userEmailLabel").textContent = userName || user.email;
  selectedCategoryId = null;
  selectedGroupId = null;
  currentGroupData = null;
  await resolveRole(user);

  if (currentRole === "superadmin") {
    /* [신규] 플랫폼 최고관리자 - 특정 교회 화면이 아니라 전용 대시보드로 진입 */
    document.getElementById("roleLabel").textContent = roleName(currentRole);
    document.getElementById("churchName").value = "관리자 대시보드";
    document.getElementById("churchName").disabled = true;
    document.getElementById("churchCodeBadge").style.display = "none";
    document.getElementById("adminTabbar").style.display = "none";
    document.getElementById("planToggleBtn").style.display = "none";
    renderRoleSwitcher();
    await enterSuperadminDashboard();
    return;
  }
  // if (currentRole === "church_pending") {
  //   /* [신규] 교회를 새로 등록했지만 아직 슈퍼관리자 승인 전 */
  //   document.getElementById("roleLabel").textContent = roleName(currentRole);
  //   document.getElementById("churchName").value =
  //     (currentChurchData && currentChurchData.name) || "";
  //   document.getElementById("churchName").disabled = true;
  //   document.getElementById("churchCodeBadge").style.display = "none";
  //   document.getElementById("logoUploadLabel").style.display = "none";
  //   renderRoleSwitcher();
  //   document.getElementById("pendingChurchName").textContent =
  //     (currentChurchData && currentChurchData.name) || "";
  //   renderBreadcrumb();
  //   showMain("church-pending");
  //   navigateTo({ level: "church-pending" }, true);
  //   return;
  // }

  /* [신규] 역할 컨텍스트가 1개 이하면(기존 사용자와 동일) 바로 진입,
     2개 이상(예: A팀 팀장 + B그룹 운영자 동시 보유)이면 역할 선택 화면을 먼저 보여줌 */
  if (currentRole === "admin" || userContexts.length <= 1) {
    activeContextIndex = 0;
    applyActiveContext();
    await enterAppAfterRoleReady();
  } else {
    await loadContextLabels();
    renderRolePicker();
    showMain("rolepicker");
  }
}

/* [신규] 역할 선택(또는 자동 확정) 이후 공통 진입 절차.
   기존에는 onAuthStateChanged 안에 바로 있던 로직이었으나,
   역할 선택 화면에서 사용자가 고른 뒤에도 동일한 절차를 타야 해서 함수로 분리함 */
async function enterAppAfterRoleReady() {
  document.getElementById("roleLabel").textContent = roleName(currentRole);
  await loadChurchName();
  document.getElementById("todayLabel").textContent =
    fmtDate(todayStr()) + " 기준";
  /* [수정] 운영자/팀장 이름 표시(userLabel)가 usersList를 참조하는데,
     기존엔 운영자 지정 모달을 열어야만 채워져서 카테고리·그룹 목록에는
     이메일만 보였음 - 로그인 직후 미리 로드해둠 */
  await loadUsers();
  renderRoleSwitcher();
  await initRoleView();
  /* [신규] 로그인 직후 팝업 공지사항 확인 (오늘 하루 안 보기 처리된 건 제외) */
  checkNoticePopups();
}

/* =========================================================
   [신규] 역할(role) 조회 - 다중 컨텍스트 지원
   - roles/{email} 문서는 이제 { contexts: [{role, groupId?, categoryId?}, ...] } 형태.
   - 예전 단일 role 문서({role, groupId/categoryId})도 자동으로 배열 1개짜리로 변환해 읽으므로
   기존 가입자는 별도 마이그레이션 없이 그대로 동작함.
   ========================================================= */
async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL) {
    currentRole = "superadmin";
    currentChurchId = null;
    roleScope = {};
    userContexts = [];
    activeContextIndex = 0;
    return;
  }

  /* 사용자 문서에서 소속 교회를 확인 */
  let userDoc;
  try {
    userDoc = await db.collection("users").doc(user.email).get();
  } catch (e) {
    userDoc = null;
  }
  const churchId = userDoc && userDoc.exists ? userDoc.data().churchId : null;

  if (!churchId) {
    /* 소속 교회가 없음 (예전 방식 가입자 등) - 기존과 동일하게 "권한 없음" 처리 */
    currentChurchId = null;
    currentRole = "none";
    userContexts = [];
    activeContextIndex = 0;
    return;
  }

  let churchDoc;
  try {
    churchDoc = await db.collection("churches").doc(churchId).get();
  } catch (e) {
    churchDoc = null;
  }
  if (!churchDoc || !churchDoc.exists || churchDoc.data().status !== "approved") {
    /* 교회 자체가 아직 슈퍼관리자의 승인을 기다리는 중 */
    currentChurchId = churchId;
    currentChurchData = churchDoc && churchDoc.exists ? { id: churchId, ...churchDoc.data() } : null;
    currentRole = "admin";
    userContexts = [];
    activeContextIndex = 0;
    return;
  }

  currentChurchId = churchId;
  currentChurchData = { id: churchId, ...churchDoc.data() };
  try {
    const doc = await db.collection("roles").doc(user.email).get();
    if (!doc.exists) {
      /* [수정] 예전(버그 있던) 일반 가입 경로로 들어와 roles 문서가 아예
         없는 계정 - 본인이 로그인한 지금 이 시점에 스스로 "none" 문서를
         만들어 채워넣음(본인이 본인 문서를 create하는 건 규칙상 허용됨).
         이렇게 해야 이후 운영자/그룹장이 이 사람에게 역할을 줄 때
         update로 처리되어 정상 동작함 */
      try {
        await db.collection("roles").doc(user.email).set({
          contexts: [{ role: "none", churchId }],
          churchIds: [churchId],
          approvedChurchIds: [],
        });
        userContexts = [];
      } catch (e2) {
        userContexts = [];
      }
    } else {
      userContexts = extractContexts(doc.data());
      /* [수정] 이미 실제 역할(그룹장/팀장 등)을 갖고 있는데 예전 "none"
         자리표시자가 함께 남아있는 기존 계정을 위한 방어 조치 - 실제 역할이
         하나라도 있으면 화면(역할 선택/전환)에서는 none 항목을 숨김.
         DB의 leftover는 다음 번 역할 변경 시 addRoleContext가 정리함 */
      const hasRealRole = userContexts.some((c) => c.role !== "none");
      if (hasRealRole) {
        userContexts = userContexts.filter((c) => c.role !== "none");
      }
    }
  } catch (e) {
    userContexts = [];
  }
  activeContextIndex = 0;
}

/* roles 문서 데이터에서 컨텍스트 배열을 뽑아냄 (신규/구버전 포맷 모두 지원) */
function extractContexts(data) {
  if (!data) return [];
  if (Array.isArray(data.contexts)) return data.contexts;
  if (data.role) {
    return [
      {
        role: data.role,
        groupId: data.groupId || null,
        categoryId: data.categoryId || null,
      },
    ];
  }
  return [];
}

function sameContext(a, b) {
  return (
    a.role === b.role &&
    (a.churchId || null) === (b.churchId || null) &&
    (a.groupId || null) === (b.groupId || null) &&
    (a.categoryId || null) === (b.categoryId || null)
  );
}

/* contexts 배열로부터 churchIds(걸쳐있는 모든 교회)와 approvedChurchIds
   ("none"이 아닌 역할을 가진 교회만)를 다시 계산. roles 문서를 쓸 때마다
   항상 이 두 필드를 함께 갱신해야 firestore.rules가 기대하는 스키마와
   어긋나지 않음(둘 중 하나라도 빠지면 이후 그 사람의 읽기/쓰기 권한
   체크가 전부 깨짐) */
function deriveChurchFields(contexts) {
  const churchIds = [...new Set(contexts.map((c) => c.churchId).filter(Boolean))];
  const approvedChurchIds = [
    ...new Set(
      contexts
        .filter((c) => c.role && c.role !== "none")
        .map((c) => c.churchId)
        .filter(Boolean),
    ),
  ];
  return { churchIds, approvedChurchIds };
}

/* 활성 컨텍스트(userContexts[activeContextIndex])를 currentRole/roleScope에 반영 */
function applyActiveContext() {
  if (currentRole === "admin") {
    roleScope = {};
    return;
  }
  const ctx = userContexts[activeContextIndex];
  if (!ctx) {
    currentRole = "none";
    roleScope = {};
    return;
  }
  currentRole = ctx.role;
  roleScope = ctx.categoryId
    ? { categoryId: ctx.categoryId }
    : ctx.groupId
      ? { groupId: ctx.groupId }
      : {};
}

/* 역할 선택 화면/전환 드롭다운에 표시할 이름(그룹명·카테고리명)을 채워 넣음 */
async function loadContextLabels() {
  const groupIds = [
    ...new Set(userContexts.filter((c) => c.groupId).map((c) => c.groupId)),
  ];
  const catIds = [
    ...new Set(
      userContexts.filter((c) => c.categoryId).map((c) => c.categoryId),
    ),
  ];
  const [groupDocs, catDocs] = await Promise.all([
    Promise.all(groupIds.map((id) => churchCol("groups").doc(id).get())),
    Promise.all(
      catIds.map((id) => churchCol("categories").doc(id).get()),
    ),
  ]);
  const groupNameMap = {};
  groupIds.forEach((id, i) => {
    groupNameMap[id] = groupDocs[i].exists
      ? groupDocs[i].data().name
      : "삭제된 그룹";
  });
  const catNameMap = {};
  catIds.forEach((id, i) => {
    catNameMap[id] = catDocs[i].exists
      ? catDocs[i].data().name
      : "삭제된 카테고리";
  });
  userContexts.forEach((c) => {
    if (c.role === "leader") {
      c.scopeName = groupNameMap[c.groupId] || "그룹";
      c.label = `${c.scopeName} · 팀장`;
    } else if (c.role === "operator") {
      c.scopeName = catNameMap[c.categoryId] || "카테고리";
      c.label = `${c.scopeName} · 그룹장`;
    } else {
      c.label = roleName(c.role);
    }
  });
}

/* =========================================================
   [신규] roles/{email} 문서에 컨텍스트 추가/제거 (팀장·운영자 지정/해제 시 사용)
   - 트랜잭션으로 처리해 동시에 여러 그룹에 지정되어도 유실되지 않도록 함
   ========================================================= */
async function addRoleContext(email, ctx) {
  const fullCtx = { ...ctx, churchId: ctx.churchId || currentChurchId };
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    let contexts = extractContexts(doc.exists ? doc.data() : null);
    /* [수정] 최초 가입 때 자리표시자로 생성된 같은 교회의 "none"(권한 없음)
       컨텍스트가 남아있으면, 실제 역할을 부여하는 시점에 함께 제거함.
       그대로 두면 역할이 2개(권한없음 + 그룹장/팀장)가 되어 로그인할 때마다
       불필요한 역할 선택 화면과 "권한 없음" 항목이 계속 보이게 됨 */
    if (fullCtx.role !== "none") {
      contexts = contexts.filter(
        (c) => !(c.role === "none" && c.churchId === fullCtx.churchId),
      );
    }
    if (!contexts.some((c) => sameContext(c, fullCtx))) {
      contexts = [...contexts, fullCtx];
    }
    t.set(ref, { contexts, ...deriveChurchFields(contexts) }, { merge: false });
  });
}

async function removeRoleContext(email, ctx) {
  const fullCtx = { ...ctx, churchId: ctx.churchId || currentChurchId };
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) return;
    let contexts = extractContexts(doc.data());
    contexts = contexts.filter((c) => !sameContext(c, fullCtx));
    t.set(ref, { contexts, ...deriveChurchFields(contexts) }, { merge: false });
  });
}

async function loadChurchName() {
  const name = currentChurchData && currentChurchData.name
    ? currentChurchData.name.replace(/\s+/g, "")
    : "교회";
  document.getElementById("churchName").value = name;
  document.getElementById("churchName").disabled = currentRole !== "admin";

  /* [신규] 업로드된 교회 로고가 있으면 표지에 반영 (없으면 기본 아이콘 유지) */
  const logoImg = document.getElementById("churchLogoImg");
  if (logoImg) {
    logoImg.src =
      (currentChurchData && currentChurchData.logoUrl) || "icon.jpg";
  }

  /* [신규] 운영자(옛 관리자)에게만 공유용 교회 코드를 보여줌.
     로고 변경/교회 정보 수정은 '교회 설정' 탭(church-settings.js)에서 처리 */
  const isChurchOwner = currentRole === "admin";
  const codeBadge = document.getElementById("churchCodeBadge");
  if (isChurchOwner && currentChurchData && currentChurchData.code) {
    document.getElementById("churchCodeText").textContent =
      currentChurchData.code;
    codeBadge.style.display = "inline-flex";
  } else {
    codeBadge.style.display = "none";
  }

  /* [신규] 요금제 표시 - 운영자만 토글(임시, 결제 연동 전까지) 가능 */
  const planBtn = document.getElementById("planToggleBtn");
  const plan = (currentChurchData && currentChurchData.plan) || "free";
  document.getElementById("planStatusText").textContent =
    plan === "free" ? "무료" : "유료";
  planBtn.style.display = "inline-block";
  planBtn.disabled = !isChurchOwner;
}

document.getElementById("churchName").addEventListener("change", async (e) => {
  if (currentRole !== "admin" || !currentChurchId) return;
  const name = e.target.value.trim();
  await churchDocRef().update({ name });
  if (currentChurchData) currentChurchData.name = name;
});

document.getElementById("copyChurchCodeBtn").addEventListener("click", async () => {
  const code = document.getElementById("churchCodeText").textContent;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    const btn = document.getElementById("copyChurchCodeBtn");
    const original = btn.textContent;
    btn.textContent = "복사됨";
    setTimeout(() => (btn.textContent = original), 1200);
  } catch (e) {
    alert("교회 코드: " + code);
  }
});

/* [신규] 일반 가입 링크 공유 - Web Share API가 있으면(주로 모바일) 공유
   시트를 띄우고, 없으면(대부분의 PC 브라우저) 클립보드로 링크를 복사함 */
function buildChurchInviteLink(code) {
  return `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
}

async function copyTextToClipboard(text, btnEl, doneLabel) {
  try {
    await navigator.clipboard.writeText(text);
    if (btnEl) {
      const original = btnEl.textContent;
      btnEl.textContent = doneLabel || "복사됨";
      setTimeout(() => (btnEl.textContent = original), 1200);
    }
  } catch (e) {
    prompt("아래 내용을 복사해 전달해주세요:", text);
  }
}

async function shareChurchInviteLink(code, btnEl) {
  if (!code) {
    alert("교회 코드를 아직 발급받지 못했습니다.");
    return;
  }
  const link = buildChurchInviteLink(code);
  const churchName = (currentChurchData && currentChurchData.name) || "교회";
  if (navigator.share) {
    try {
      await navigator.share({
        title: "교회 출석부 가입 초대",
        text: `${churchName} 교회 출석부에 가입해주세요!`,
        url: link,
      });
      return;
    } catch (e) {
      /* 사용자가 공유 창을 닫은 경우(AbortError)는 조용히 무시 */
      if (e && e.name === "AbortError") return;
    }
  }
  await copyTextToClipboard(link, btnEl, "링크 복사됨");
}

document.getElementById("shareChurchLinkBtn").addEventListener("click", (e) => {
  const code = document.getElementById("churchCodeText").textContent;
  shareChurchInviteLink(code, e.currentTarget);
});

document
  .getElementById("settingsShareLinkBtn")
  .addEventListener("click", (e) => {
    const code = currentChurchData && currentChurchData.code;
    shareChurchInviteLink(code, e.currentTarget);
  });

document
  .getElementById("settingsCopyLinkBtn")
  .addEventListener("click", (e) => {
    const code = currentChurchData && currentChurchData.code;
    if (!code) {
      alert("교회 코드를 아직 발급받지 못했습니다.");
      return;
    }
    copyTextToClipboard(buildChurchInviteLink(code), e.currentTarget, "복사됨");
  });

/* [신규] 요금제 토글 (임시 - 실제 결제 연동 전까지 운영자가 직접 전환) */
document.getElementById("planToggleBtn").addEventListener("click", async () => {
  if (currentRole !== "admin" || !currentChurchId) return;
  const next =
    currentChurchData && currentChurchData.plan === "free" ? "paid" : "free";
  await churchDocRef().update({ plan: next });
  if (currentChurchData) currentChurchData.plan = next;
  document.getElementById("planStatusText").textContent =
    next === "free" ? "무료" : "유료";
});
