/* =========================================================
   인증 처리
   ========================================================= */
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!email || !pw) {
    errEl.textContent = "이메일과 비밀번호를 입력하세요.";
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    errEl.textContent = translateAuthError(e);
  }
});

/* =========================================================
   [신규] 가입 유형 전환 (교회 가입 / 일반 가입)
   ========================================================= */
document.getElementById("showChurchSignupBtn").addEventListener("click", () => {
  document.getElementById("churchSignupBox").style.display = "block";
  document.getElementById("regularSignupBox").style.display = "none";
  document.getElementById("loginError").textContent = "";
});
document
  .getElementById("showRegularSignupBtn")
  .addEventListener("click", () => {
    document.getElementById("regularSignupBox").style.display = "block";
    document.getElementById("churchSignupBox").style.display = "none";
    document.getElementById("loginError").textContent = "";
  });

/* 교회 ID(코드) 생성 - 헷갈리기 쉬운 0/O, 1/l/I 등은 제외 */
function generateChurchCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function generateUniqueChurchCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateChurchCode();
    const doc = await db.collection("churches").doc(code).get();
    if (!doc.exists) return code;
  }
  throw new Error("교회 ID 생성에 실패했습니다. 다시 시도해주세요.");
}

/* =========================================================
   [신규] 교회 가입 (새 교회 등록 + 관리자 권한)
   ========================================================= */
document
  .getElementById("churchSignupBtn")
  .addEventListener("click", async () => {
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    const nameInput = document.getElementById("churchSignupName");
    const churchNameInput = document.getElementById("churchSignupChurchName");
    const name = nameInput.value.trim();
    const churchName = churchNameInput.value.trim();
    const email = document.getElementById("loginEmail").value.trim();
    const pw = document.getElementById("loginPassword").value;

    if (!name) {
      errEl.textContent = "이름을 입력하세요.";
      nameInput.focus();
      return;
    }
    if (!churchName) {
      errEl.textContent = "교회 이름을 입력하세요.";
      churchNameInput.focus();
      return;
    }
    if (!email || !pw) {
      errEl.textContent = "이메일과 비밀번호를 입력하세요.";
      return;
    }
    if (pw.length < 6) {
      errEl.textContent = "비밀번호는 6자 이상이어야 합니다.";
      return;
    }

    const btn = document.getElementById("churchSignupBtn");
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "가입 처리 중...";
    try {
      const code = await generateUniqueChurchCode();
      await auth.createUserWithEmailAndPassword(email, pw);
      await db.collection("churches").doc(code).set({
        name: churchName,
        logoUrl: null,
        plan: "free",
        createdAt: Date.now(),
      });
      await addRoleContext(email, { role: "admin", churchId: code });
      await ensureUserDoc({ email }, name, code);
      /* 로그인 후 화면 상단의 '교회 코드' 배지에서 계속 확인/복사할 수 있음 */
    } catch (e) {
      errEl.textContent = translateAuthError(e);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

/* =========================================================
   [신규] 일반 가입 (기존 교회의 코드로 소속 가입 - 승인 대기 상태로 시작)
   ========================================================= */
document
  .getElementById("regularSignupBtn")
  .addEventListener("click", async () => {
    const errEl = document.getElementById("loginError");
    errEl.textContent = "";
    const nameInput = document.getElementById("regularSignupName");
    const codeInput = document.getElementById("regularSignupCode");
    const name = nameInput.value.trim();
    const churchCode = codeInput.value.trim().toUpperCase();
    const email = document.getElementById("loginEmail").value.trim();
    const pw = document.getElementById("loginPassword").value;

    if (!name) {
      errEl.textContent = "이름을 입력하세요.";
      nameInput.focus();
      return;
    }
    if (!churchCode) {
      errEl.textContent = "교회 코드를 입력하세요.";
      codeInput.focus();
      return;
    }
    if (!email || !pw) {
      errEl.textContent = "이메일과 비밀번호를 입력하세요.";
      return;
    }
    if (pw.length < 6) {
      errEl.textContent = "비밀번호는 6자 이상이어야 합니다.";
      return;
    }

    const btn = document.getElementById("regularSignupBtn");
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "가입 처리 중...";
    try {
      const targetChurchDoc = await db
        .collection("churches")
        .doc(churchCode)
        .get();
      if (!targetChurchDoc.exists) {
        errEl.textContent =
          "존재하지 않는 교회 코드입니다. 관리자에게 다시 확인해주세요.";
        return;
      }
      await auth.createUserWithEmailAndPassword(email, pw);
      await addRoleContext(email, { role: "none", churchId: churchCode });
      await ensureUserDoc({ email }, name, churchCode);
    } catch (e) {
      errEl.textContent = translateAuthError(e);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
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

/* [수정] 가입한 교회(churchId)도 함께 저장 - 운영자/팀장 지정 화면(user-picker)에서
   "우리 교회에 가입한 사람"만 골라 보여주기 위해 필요함 */
async function ensureUserDoc(user, name, churchId) {
  try {
    const ref = db.collection("users").doc(user.email);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        email: user.email,
        name: name || "",
        churchId: churchId || null,
        createdAt: Date.now(),
      });
      return name || "";
    } else {
      const patch = {};
      if (name && !doc.data().name) patch.name = name;
      if (churchId && !doc.data().churchId) patch.churchId = churchId;
      if (Object.keys(patch).length) await ref.update(patch);
      return doc.data().name || name || "";
    }
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
    const userName = await ensureUserDoc(user);
    document.getElementById("userEmailLabel").textContent =
      userName || user.email;
    await resolveRole(user);

    /* [수정] 관리자도 이제 "교회별 admin 컨텍스트"라 특별취급 불필요.
       컨텍스트가 1개 이하면 바로 진입, 2개 이상(여러 교회/역할 겸임)이면
       역할 선택 화면을 먼저 보여줌 */
    if (userContexts.length <= 1) {
      activeContextIndex = 0;
      applyActiveContext();
      await enterAppAfterRoleReady();
    } else {
      await loadContextLabels();
      renderRolePicker();
      showMain("rolepicker");
    }
  } else {
    currentUser = null;
    currentRole = null;
    roleScope = {};
    userContexts = [];
    activeContextIndex = 0;
    currentChurchId = null;
    churchDoc = null;
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appScreen").style.display = "none";
  }
});

/* [신규] 역할 선택(또는 자동 확정) 이후 공통 진입 절차. */
async function enterAppAfterRoleReady() {
  document.getElementById("roleLabel").textContent = roleName(currentRole);
  await loadChurchInfo();
  document.getElementById("todayLabel").textContent =
    fmtDate(todayStr()) + " 기준";
  /* [수정] 운영자/팀장 이름 표시(userLabel)가 usersList를 참조하는데,
     로그인 직후 미리 로드해둠 (우리 교회 소속만) */
  await loadUsers();
  renderRoleSwitcher();
  await initRoleView();
  /* [신규] 로그인 직후 팝업 공지사항 확인 (오늘 하루 안 보기 처리된 건 제외) */
  checkNoticePopups();
}

/* =========================================================
   [신규] 역할(role) 조회 - 다중 컨텍스트 지원 (교회별 admin 포함)
   - roles/{email} 문서는 { contexts: [{role, churchId, groupId?, categoryId?}, ...] } 형태.
   - 예전 단일 role 문서({role, groupId/categoryId})도 자동으로 배열 1개짜리로 변환해 읽음
   ========================================================= */
async function resolveRole(user) {
  try {
    const doc = await db.collection("roles").doc(user.email).get();
    userContexts = extractContexts(doc.exists ? doc.data() : null);
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

/* 활성 컨텍스트(userContexts[activeContextIndex])를 currentRole/roleScope/currentChurchId에 반영 */
function applyActiveContext() {
  const ctx = userContexts[activeContextIndex];
  if (!ctx) {
    currentRole = "none";
    roleScope = {};
    currentChurchId = null;
    churchDoc = null;
    return;
  }
  currentRole = ctx.role;
  currentChurchId = ctx.churchId || null;
  roleScope = ctx.categoryId
    ? { categoryId: ctx.categoryId }
    : ctx.groupId
      ? { groupId: ctx.groupId }
      : {};
}

/* 역할 선택 화면/전환 드롭다운에 표시할 이름(교회명·그룹명·카테고리명)을 채워 넣음 */
async function loadContextLabels() {
  const churchIds = [
    ...new Set(userContexts.map((c) => c.churchId).filter(Boolean)),
  ];
  const groupIds = [
    ...new Set(userContexts.filter((c) => c.groupId).map((c) => c.groupId)),
  ];
  const catIds = [
    ...new Set(
      userContexts.filter((c) => c.categoryId).map((c) => c.categoryId),
    ),
  ];
  const [churchDocs, groupDocs, catDocs] = await Promise.all([
    Promise.all(churchIds.map((id) => db.collection("churches").doc(id).get())),
    Promise.all(groupIds.map((id) => db.collection("groups").doc(id).get())),
    Promise.all(
      catIds.map((id) => db.collection("categories").doc(id).get()),
    ),
  ]);
  const churchNameMap = {};
  churchIds.forEach((id, i) => {
    churchNameMap[id] = churchDocs[i].exists
      ? churchDocs[i].data().name
      : "알 수 없는 교회";
  });
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
    const churchName = churchNameMap[c.churchId] || "";
    if (c.role === "admin") {
      c.scopeName = churchName;
      c.label = `${churchName} · 관리자`;
    } else if (c.role === "leader") {
      c.scopeName = groupNameMap[c.groupId] || "그룹";
      c.label = `${churchName} · ${c.scopeName} · 팀장`;
    } else if (c.role === "operator") {
      c.scopeName = catNameMap[c.categoryId] || "카테고리";
      c.label = `${churchName} · ${c.scopeName} · 운영자`;
    } else {
      c.scopeName = churchName;
      c.label = `${churchName} · 승인 대기`;
    }
  });
}

/* =========================================================
   [신규] roles/{email} 문서에 컨텍스트 추가/제거 (팀장·운영자·관리자 지정/해제 시 사용)
   - contexts 외에 churchIds(가입된 모든 교회)와 approvedChurchIds(승인된
   역할을 가진 교회, 즉 role이 "none"이 아닌 것)도 함께 유지함.
   Firestore 보안 규칙은 배열 안의 map을 부분일치로 걸러낼 수 없어서,
   "이 사람이 이 교회에 뭔가 승인된 역할이 있는지"를 규칙에서 싸게
   확인하려면 이렇게 평평한(flat) 배열이 따로 필요함 */
function computeChurchIdArrays(contexts) {
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

async function addRoleContext(email, ctx) {
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    let contexts = extractContexts(doc.exists ? doc.data() : null);
    if (!contexts.some((c) => sameContext(c, ctx))) {
      contexts = [...contexts, ctx];
    }
    const { churchIds, approvedChurchIds } = computeChurchIdArrays(contexts);
    t.set(ref, { contexts, churchIds, approvedChurchIds }, { merge: false });
  });
}

async function removeRoleContext(email, ctx) {
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) return;
    let contexts = extractContexts(doc.data());
    contexts = contexts.filter((c) => !sameContext(c, ctx));
    const { churchIds, approvedChurchIds } = computeChurchIdArrays(contexts);
    t.set(ref, { contexts, churchIds, approvedChurchIds }, { merge: false });
  });
}

/* =========================================================
   [신규] 교회 정보 로딩 - 이름/로고/교회코드/요금제 배지까지 한 번에 반영
   ========================================================= */
async function loadChurchInfo() {
  const nameInput = document.getElementById("churchName");
  const logoImg = document.getElementById("churchLogoImg");
  const logoLabel = document.getElementById("logoUploadLabel");
  const codeBadge = document.getElementById("churchCodeBadge");
  const codeText = document.getElementById("churchCodeText");

  if (!currentChurchId) {
    nameInput.value = "";
    nameInput.disabled = true;
    logoImg.src = "icon.jpg";
    logoLabel.style.display = "none";
    codeBadge.style.display = "none";
    return;
  }

  try {
    const doc = await db.collection("churches").doc(currentChurchId).get();
    churchDoc = doc.exists ? { id: currentChurchId, ...doc.data() } : null;
    nameInput.value = churchDoc ? churchDoc.name : "";
    logoImg.src = churchDoc && churchDoc.logoUrl ? churchDoc.logoUrl : "icon.jpg";
  } catch (e) {}

  nameInput.disabled = currentRole !== "admin";
  logoLabel.style.display = currentRole === "admin" ? "inline-block" : "none";
  codeBadge.style.display = currentRole === "admin" ? "flex" : "none";
  codeText.textContent = currentChurchId;
  updatePlanBadge();
}

document.getElementById("churchName").addEventListener("change", async (e) => {
  if (currentRole !== "admin" || !currentChurchId) return;
  await db
    .collection("churches")
    .doc(currentChurchId)
    .update({ name: e.target.value });
  if (churchDoc) churchDoc.name = e.target.value;
});

/* [신규] 교회 코드 복사 버튼 */
document
  .getElementById("copyChurchCodeBtn")
  .addEventListener("click", async () => {
    if (!currentChurchId) return;
    const btn = document.getElementById("copyChurchCodeBtn");
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(currentChurchId);
      btn.textContent = "복사됨!";
    } catch (e) {
      alert("복사에 실패했습니다. 교회 코드: " + currentChurchId);
    }
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  });

/* [신규] 교회 로고 업로드 (Firebase Storage) */
document
  .getElementById("logoUploadInput")
  .addEventListener("change", async (e) => {
    if (currentRole !== "admin" || !currentChurchId) return;
    const file = e.target.files[0];
    if (!file) return;
    const input = e.target;
    input.disabled = true;
    try {
      const ref = storage.ref(`church-logos/${currentChurchId}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      await db
        .collection("churches")
        .doc(currentChurchId)
        .update({ logoUrl: url });
      document.getElementById("churchLogoImg").src = url;
      if (churchDoc) churchDoc.logoUrl = url;
    } catch (err) {
      alert("로고 업로드에 실패했습니다: " + err.message);
    } finally {
      input.disabled = false;
      input.value = "";
    }
  });

/* =========================================================
   [신규] 요금제 상태 (실제 결제 연동 전까지는 관리자가 직접 토글)
   ========================================================= */
function updatePlanBadge() {
  const text = document.getElementById("planStatusText");
  if (!text) return;
  text.textContent = churchDoc && churchDoc.plan === "paid" ? "유료" : "무료";
}

document
  .getElementById("planToggleBtn")
  .addEventListener("click", async () => {
    if (currentRole !== "admin" || !currentChurchId) return;
    const next = churchDoc && churchDoc.plan === "paid" ? "free" : "paid";
    await db.collection("churches").doc(currentChurchId).update({ plan: next });
    if (churchDoc) churchDoc.plan = next;
    updatePlanBadge();
  });
