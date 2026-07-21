/* =========================================================
   [신규 추가] 교회 코드 생성 함수 (6자리 영문 대문자+숫자)
   ========================================================= */
function generateChurchCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
        document
          .getElementById("churchSignupAddress")
          .classList.remove("input-invalid");
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

/* [신규] 이용약관/개인정보 동의 체크박스가 둘 다 체크됐는지 확인 */
function checkConsents(termsCbId, privacyCbId, errEl) {
  const termsCb = document.getElementById(termsCbId);
  const privacyCb = document.getElementById(privacyCbId);
  const termsRow = termsCb.closest(".consent-row");
  const privacyRow = privacyCb.closest(".consent-row");
  termsRow.classList.toggle("input-invalid", !termsCb.checked);
  privacyRow.classList.toggle("input-invalid", !privacyCb.checked);
  if (!termsCb.checked || !privacyCb.checked) {
    errEl.textContent =
      "이용약관과 개인정보 수집·이용에 모두 동의해야 가입할 수 있습니다.";
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

/* 이메일/비밀번호 공통 검증 */
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

    let stage = "확인 중";
    try {
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
        const exactDup = dupSnap.docs.some(
          (d) => d.data().addressKey === addressKey,
        );
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
      suppressAutoRoute = true;
      stage = "계정 생성";
      try {
        await auth.createUserWithEmailAndPassword(cred.email, cred.pw);
        await auth.currentUser.getIdToken(true);

        stage = "교회 문서 생성";
        const churchRef = await db.collection("churches").add({
          name: churchName,
          nameKey,
          code: generateChurchCode(), // 정상 참조되도록 고침
          status: "approved",
          plan: "free",
          ownerEmail: cred.email,
          createdAt: Date.now(),
          address: addressEl.value.trim(),
          addressDetail,
          zonecode: document.getElementById("churchSignupZonecode").value,
          addressKey,
          denomination:
            denomEl.value === "기타" ? denomEtcEl.value.trim() : denomEl.value,
          pastorName: pastorEl.value.trim() || null,
        });

        stage = "사용자/역할 문서 생성";
        const userRef = db.collection("users").doc(cred.email);
        const rolesRef = db.collection("roles").doc(cred.email);
        const batch = db.batch();
        batch.set(userRef, {
          email: cred.email,
          name: nameEl.value.trim(),
          createdAt: Date.now(),
          churchId: churchRef.id,
          agreedTermsAt: Date.now(),
          agreedPrivacyAt: Date.now(),
        });
        batch.set(rolesRef, {
          contexts: [{ role: "admin", churchId: churchRef.id }],
          churchIds: [churchRef.id],
          approvedChurchIds: [churchRef.id],
        });
        await batch.commit();

        stage = "화면 진입(라우팅)";
        await routeAfterAuth(auth.currentUser);
      } finally {
        suppressAutoRoute = false;
      }
    } catch (e) {
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
        await auth.currentUser.getIdToken(true);
        const userRef = db.collection("users").doc(cred.email);
        const rolesRef = db.collection("roles").doc(cred.email);
        const batch = db.batch();
        batch.set(userRef, {
          email: cred.email,
          name: nameEl.value.trim(),
          createdAt: Date.now(),
          churchId: churchDoc.id,
          agreedTermsAt: Date.now(),
          agreedPrivacyAt: Date.now(),
        });
        batch.set(rolesRef, {
          contexts: [{ role: "none", churchId: churchDoc.id }],
          churchIds: [churchDoc.id],
          approvedChurchIds: [],
        });
        await batch.commit();
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

/* 비밀번호 재설정 */
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
    return "";
  }
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    document.getElementById("userEmailLabel").textContent = user.email;
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

async function routeAfterAuth(user) {
  const userName = await ensureUserDoc(user);
  document.getElementById("userEmailLabel").textContent =
    userName || user.email;
  selectedCategoryId = null;
  selectedGroupId = null;
  currentGroupData = null;
  await resolveRole(user);

  if (currentRole === "superadmin") {
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

async function enterAppAfterRoleReady() {
  document.getElementById("roleLabel").textContent = roleName(currentRole);
  await loadChurchName();
  document.getElementById("todayLabel").textContent =
    fmtDate(todayStr()) + " 기준";
  await loadUsers();
  renderRoleSwitcher();
  await initRoleView();
  checkNoticePopups();
}

async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL) {
    currentRole = "superadmin";
    currentChurchId = null;
    roleScope = {};
    userContexts = [];
    activeContextIndex = 0;
    return;
  }

  let userDoc;
  try {
    userDoc = await db.collection("users").doc(user.email).get();
  } catch (e) {
    userDoc = null;
  }
  const churchId = userDoc && userDoc.exists ? userDoc.data().churchId : null;

  if (!churchId) {
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
  if (
    !churchDoc ||
    !churchDoc.exists ||
    churchDoc.data().status !== "approved"
  ) {
    currentChurchId = churchId;
    currentChurchData =
      churchDoc && churchDoc.exists
        ? { id: churchId, ...churchDoc.data() }
        : null;
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
      try {
        await db
          .collection("roles")
          .doc(user.email)
          .set({
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

function deriveChurchFields(contexts) {
  const churchIds = [
    ...new Set(contexts.map((c) => c.churchId).filter(Boolean)),
  ];
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
    Promise.all(catIds.map((id) => churchCol("categories").doc(id).get())),
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

async function addRoleContext(email, ctx) {
  const fullCtx = { ...ctx, churchId: ctx.churchId || currentChurchId };
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    let contexts = extractContexts(doc.exists ? doc.data() : null);
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
  const name =
    currentChurchData && currentChurchData.name
      ? currentChurchData.name.replace(/\s+/g, "")
      : "교회";
  document.getElementById("churchName").value = name;
  document.getElementById("churchName").disabled = currentRole !== "admin";

  const logoImg = document.getElementById("churchLogoImg");
  if (logoImg) {
    logoImg.src =
      (currentChurchData && currentChurchData.logoUrl) || "icon.jpg";
  }

  const isChurchOwner = currentRole === "admin";
  const codeBadge = document.getElementById("churchCodeBadge");
  if (isChurchOwner && currentChurchData && currentChurchData.code) {
    document.getElementById("churchCodeText").textContent =
      currentChurchData.code;
    codeBadge.style.display = "inline-flex";
  } else {
    codeBadge.style.display = "none";
  }

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

document
  .getElementById("copyChurchCodeBtn")
  .addEventListener("click", async () => {
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

document.getElementById("planToggleBtn").addEventListener("click", async () => {
  if (currentRole !== "admin" || !currentChurchId) return;
  const next =
    currentChurchData && currentChurchData.plan === "free" ? "paid" : "free";
  await churchDocRef().update({ plan: next });
  if (currentChurchData) currentChurchData.plan = next;
  document.getElementById("planStatusText").textContent =
    next === "free" ? "무료" : "유료";
});
