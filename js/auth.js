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
    } else if (name && !doc.data().name) {
      await ref.update({ name });
    }
  } catch (e) {
    /* 유저 정보 저장 실패는 앱 진행에 영향 없도록 무시 */
  }
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    document.getElementById("userEmailLabel").textContent = user.email;
    await ensureUserDoc(user);
    await resolveRole(user);
    document.getElementById("roleLabel").textContent = roleName(currentRole);
    await loadChurchName();
    document.getElementById("todayLabel").textContent =
      fmtDate(todayStr()) + " 기준";
    await initRoleView();
  } else {
    currentUser = null;
    currentRole = null;
    roleScope = {};
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appScreen").style.display = "none";
  }
});

async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL) {
    currentRole = "admin";
    roleScope = {};
    return;
  }
  try {
    const doc = await db.collection("roles").doc(user.email).get();
    if (doc.exists) {
      const data = doc.data();
      currentRole = data.role;
      roleScope = data;
    } else {
      currentRole = "none";
      roleScope = {};
    }
  } catch (e) {
    currentRole = "none";
  }
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
