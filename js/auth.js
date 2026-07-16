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
  "regularSignupName",
  "regularSignupCode",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", (e) => {
    if (e.target.value.trim()) e.target.classList.remove("input-invalid");
  });
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
    if (!markRequired([nameEl, churchNameEl])) {
      errEl.textContent = "이름과 교회 이름을 모두 입력하세요.";
      return;
    }
    const cred = validateEmailPw(errEl);
    if (!cred) return;
    const btn = document.getElementById("churchSignupBtn");
    btn.disabled = true;
    btn.textContent = "확인 중...";
    try {
      /* [수정] 슈퍼관리자 승인 절차 제거 - 대신 교회 이름 중복 여부를 먼저 확인함.
         공백 유무/대소문자 차이로 인한 중복 등록을 막기 위해 nameKey(공백 제거 + 소문자)로 비교 */
      const churchName = churchNameEl.value.trim();
      const nameKey = churchName.replace(/\s+/g, "").toLowerCase();
      const dupSnap = await db
        .collection("churches")
        .where("nameKey", "==", nameKey)
        .limit(1)
        .get();
      if (!dupSnap.empty) {
        errEl.textContent = "이미 등록된 교회 이름입니다.";
        churchNameEl.classList.add("input-invalid");
        churchNameEl.focus();
        btn.disabled = false;
        btn.textContent = "교회 가입 완료";
        return;
      }

      btn.textContent = "가입 처리 중...";
      /* [수정] 계정 생성 시점부터 우리가 직접 routeAfterAuth를 호출해
         최종 라우팅을 마칠 때까지, onAuthStateChanged의 자동 라우팅을 막음 */
      suppressAutoRoute = true;
      try {
        await auth.createUserWithEmailAndPassword(cred.email, cred.pw);
        /* [수정] 승인 대기 없이 바로 생성되도록 status를 처음부터 "approved"로 저장 */
        const churchRef = await db.collection("churches").add({
          name: churchName,
          nameKey,
          code: generateChurchCode(),
          status: "approved",
          plan: "free",
          ownerEmail: cred.email,
          createdAt: Date.now(),
        });
        await ensureUserDoc({ email: cred.email }, nameEl.value.trim(), {
          churchId: churchRef.id,
        });
        /* [수정] 이전에는 기본 카테고리를 자동 생성하고 그 카테고리의
           운영자(operator) 컨텍스트까지 함께 부여했는데, roles 문서에 컨텍스트가
           2개(admin + operator)가 되면서 "역할이 여러 개일 때 먼저 보여주는
           역할 선택 화면" 분기를 타버렸고, 그 갈림길에서 결국 역할 없음으로
           오인되어 "권한 승인 대기 중입니다" 화면에 머무는 문제가 있었음.
           애초에 "admin"(운영자) 역할 하나만으로도 카테고리 관리 권한은 이미
           충분하므로(로그인 즉시 카테고리 관리 화면으로 진입), 불필요한 카테고리
           자동 생성과 이중 역할 부여를 없애고 컨텍스트를 1개로 단순화함 */
        await db
          .collection("roles")
          .doc(cred.email)
          .set({ contexts: [{ role: "admin" }] });
        /* 문서 작성이 모두 끝난 지금 시점 기준으로 라우팅을 명시적으로 실행 */
        await routeAfterAuth(auth.currentUser);
      } finally {
        suppressAutoRoute = false;
      }
    } catch (e) {
      /* [수정] 이미 화면이 앱 화면으로 넘어가 로그인 화면(및 errEl)이
         가려져 있을 수 있으므로, alert로도 함께 알려서 실패가 조용히
         묻히지 않도록 함 */
      errEl.textContent = translateAuthError(e);
      alert("교회 가입 처리 중 문제가 발생했습니다: " + translateAuthError(e));
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
        await ensureUserDoc({ email: cred.email }, nameEl.value.trim(), {
          churchId: churchDoc.id,
        });
        /* 문서 작성이 모두 끝난 뒤 명시적으로 라우팅 */
        await routeAfterAuth(auth.currentUser);
      } finally {
        suppressAutoRoute = false;
      }
    } catch (e) {
      errEl.textContent = translateAuthError(e);
      alert("가입 처리 중 문제가 발생했습니다: " + translateAuthError(e));
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
    document.getElementById("logoUploadLabel").style.display = "none";
    document.getElementById("planToggleBtn").style.display = "none";
    renderRoleSwitcher();
    await enterSuperadminDashboard();
    return;
  }
  if (currentRole === "church_pending") {
    /* [신규] 교회를 새로 등록했지만 아직 슈퍼관리자 승인 전 */
    document.getElementById("roleLabel").textContent = roleName(currentRole);
    document.getElementById("churchName").value =
      (currentChurchData && currentChurchData.name) || "";
    document.getElementById("churchName").disabled = true;
    document.getElementById("churchCodeBadge").style.display = "none";
    document.getElementById("logoUploadLabel").style.display = "none";
    renderRoleSwitcher();
    document.getElementById("pendingChurchName").textContent =
      (currentChurchData && currentChurchData.name) || "";
    renderBreadcrumb();
    showMain("church-pending");
    navigateTo({ level: "church-pending" }, true);
    return;
  }

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
    currentRole = "church_pending";
    userContexts = [];
    activeContextIndex = 0;
    return;
  }

  currentChurchId = churchId;
  currentChurchData = { id: churchId, ...churchDoc.data() };
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
  const name = currentChurchData && currentChurchData.name
    ? currentChurchData.name.replace(/\s+/g, "")
    : "교회";
  document.getElementById("churchName").value = name;
  document.getElementById("churchName").disabled = currentRole !== "admin";

  /* [신규] 운영자(옛 관리자)에게만 공유용 교회 코드와 로고 변경 버튼을 보여줌 */
  const isChurchOwner = currentRole === "admin";
  const codeBadge = document.getElementById("churchCodeBadge");
  if (isChurchOwner && currentChurchData && currentChurchData.code) {
    document.getElementById("churchCodeText").textContent =
      currentChurchData.code;
    codeBadge.style.display = "inline-flex";
  } else {
    codeBadge.style.display = "none";
  }
  document.getElementById("logoUploadLabel").style.display = isChurchOwner
    ? "inline-block"
    : "none";

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
