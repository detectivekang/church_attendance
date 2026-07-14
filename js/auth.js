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

document.getElementById("signupBtn").addEventListener("click", async () => {
  const nameInput = document.getElementById("signupName");
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  // [신규] 이름 입력칸은 평소엔 숨겨두고, '회원가입' 버튼을 처음 누를 때만
  // 나타나도록 함. 이름을 입력하고 한 번 더 눌러야 실제 가입이 진행됨.
  if (nameInput.style.display === "none") {
    nameInput.style.display = "block";
    nameInput.focus();
    document.getElementById("signupBtn").textContent = "가입 완료";
    return;
  }

  const name = nameInput.value.trim();
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  if (!name) {
    errEl.textContent = "이름을 입력하세요.";
    nameInput.focus();
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
  try {
    await auth.createUserWithEmailAndPassword(email, pw);
    await ensureUserDoc({ email }, name);
  } catch (e) {
    errEl.textContent = translateAuthError(e);
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

async function ensureUserDoc(user, name) {
  try {
    const ref = db.collection("users").doc(user.email);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        email: user.email,
        name: name || "",
        createdAt: Date.now(),
      });
      return name || "";
    } else if (name && !doc.data().name) {
      await ref.update({ name });
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
    const userName = await ensureUserDoc(user);
    document.getElementById("userEmailLabel").textContent =
      userName || user.email;
    await resolveRole(user);

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
  } else {
    currentUser = null;
    currentRole = null;
    roleScope = {};
    userContexts = [];
    activeContextIndex = 0;
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appScreen").style.display = "none";
  }
});

/* [신규] 역할 선택(또는 자동 확정) 이후 공통 진입 절차.
   기존에는 onAuthStateChanged 안에 바로 있던 로직이었으나,
   역할 선택 화면에서 사용자가 고른 뒤에도 동일한 절차를 타야 해서 함수로 분리함 */
async function enterAppAfterRoleReady() {
  document.getElementById("roleLabel").textContent = roleName(currentRole);
  await loadChurchName();
  document.getElementById("todayLabel").textContent =
    fmtDate(todayStr()) + " 기준";
  renderRoleSwitcher();
  await initRoleView();
}

/* =========================================================
   [신규] 역할(role) 조회 - 다중 컨텍스트 지원
   - roles/{email} 문서는 이제 { contexts: [{role, groupId?, categoryId?}, ...] } 형태.
   - 예전 단일 role 문서({role, groupId/categoryId})도 자동으로 배열 1개짜리로 변환해 읽으므로
   기존 가입자는 별도 마이그레이션 없이 그대로 동작함.
   ========================================================= */
async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL) {
    currentRole = "admin";
    roleScope = {};
    userContexts = [];
    activeContextIndex = 0;
    return;
  }
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
    (a.groupId || null) === (b.groupId || null) &&
    (a.categoryId || null) === (b.categoryId || null)
  );
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
    Promise.all(groupIds.map((id) => db.collection("groups").doc(id).get())),
    Promise.all(
      catIds.map((id) => db.collection("categories").doc(id).get()),
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
      c.label = `${c.scopeName} · 운영자`;
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
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    let contexts = extractContexts(doc.exists ? doc.data() : null);
    if (!contexts.some((c) => sameContext(c, ctx))) {
      contexts = [...contexts, ctx];
    }
    t.set(ref, { contexts }, { merge: false });
  });
}

async function removeRoleContext(email, ctx) {
  const ref = db.collection("roles").doc(email);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) return;
    let contexts = extractContexts(doc.data());
    contexts = contexts.filter((c) => !sameContext(c, ctx));
    t.set(ref, { contexts }, { merge: false });
  });
}

async function loadChurchName() {
  try {
    const doc = await db.collection("settings").doc("church").get();
    const name =
      doc.exists && doc.data().name ? doc.data().name : "서산 성결 교회";
    document.getElementById("churchName").value = name;
  } catch (e) {}
  document.getElementById("churchName").disabled = currentRole !== "admin";
}

document.getElementById("churchName").addEventListener("change", async (e) => {
  if (currentRole !== "admin") return;
  await db.collection("settings").doc("church").set({ name: e.target.value });
});
