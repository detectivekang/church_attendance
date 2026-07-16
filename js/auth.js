document
  .getElementById("churchSignupBtn")
  .addEventListener("click", async () => {
    const errEl = document.getElementById("churchSignupError");
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