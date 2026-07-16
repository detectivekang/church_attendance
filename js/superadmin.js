/* =========================================================
   [신규] 슈퍼관리자(관리자, kangseabich@naver.com 전용) 대시보드
   - 특정 교회에 속하지 않고, 가입된 모든 교회를 한눈에 관리함
   - 승인 대기 중인 교회 목록(승인/거절) + 승인된 교회 목록(이름/요금제/인원수)
   ========================================================= */
let superadminChurches = [];

async function enterSuperadminDashboard() {
  renderBreadcrumb();
  showMain("superadmin");
  navigateTo({ level: "superadmin" }, true);
  await loadSuperadminChurches();
  renderSuperadminDashboard();
}

async function loadSuperadminChurches() {
  const snap = await db.collection("churches").get();
  superadminChurches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  /* 교회별 가입 인원수 계산 (users 컬렉션을 churchId로 세어봄) */
  await Promise.all(
    superadminChurches.map(async (c) => {
      try {
        const usersSnap = await db
          .collection("users")
          .where("churchId", "==", c.id)
          .get();
        c.memberCount = usersSnap.size;
      } catch (e) {
        c.memberCount = 0;
      }
    }),
  );
}

function renderSuperadminDashboard() {
  const pending = superadminChurches
    .filter((c) => c.status !== "approved" && c.status !== "rejected")
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const approved = sortByName(
    superadminChurches.filter((c) => c.status === "approved"),
  );

  /* 요약 카드 */
  document.getElementById("superadminSummary").innerHTML = `
    <div class="summary-card"><div class="num">${approved.length}</div><div class="lbl">승인된 교회</div></div>
    <div class="summary-card"><div class="num">${pending.length}</div><div class="lbl">승인 대기 교회</div></div>
    <div class="summary-card"><div class="num">${superadminChurches.reduce((s, c) => s + (c.memberCount || 0), 0)}</div><div class="lbl">전체 가입 인원</div></div>
  `;

  /* 승인 대기 목록 */
  const pendingEl = document.getElementById("superadminPendingList");
  pendingEl.innerHTML = "";
  if (pending.length === 0) {
    pendingEl.innerHTML = '<div class="empty">승인 대기 중인 교회가 없습니다.</div>';
  } else {
    pending.forEach((c) => {
      const card = document.createElement("div");
      card.className = "list-card";
      card.innerHTML = `
        <div class="list-card-main">
          <div class="list-card-title">${escapeHtml(c.name || "(이름 없음)")}</div>
          <div class="list-card-sub">신청자: ${escapeHtml(c.ownerEmail || "-")} · 코드 ${escapeHtml(c.code || "-")}</div>
        </div>
        <div class="list-card-actions">
          <button class="btn small" data-approve="${c.id}">승인</button>
          <button class="btn danger" data-reject="${c.id}">거절</button>
        </div>
      `;
      pendingEl.appendChild(card);
    });
    pendingEl.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", () =>
        approveChurch(btn.dataset.approve),
      );
    });
    pendingEl.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", () => rejectChurch(btn.dataset.reject));
    });
  }

  /* 승인된 교회 목록 */
  const listEl = document.getElementById("superadminChurchList");
  listEl.innerHTML = "";
  if (approved.length === 0) {
    listEl.innerHTML = '<div class="empty">승인된 교회가 없습니다.</div>';
    return;
  }
  approved.forEach((c) => {
    const card = document.createElement("div");
    card.className = "list-card";
    card.innerHTML = `
      <div class="list-card-main">
        <div class="list-card-title">${escapeHtml(c.name || "(이름 없음)")}</div>
        <div class="list-card-sub">요금제: ${c.plan === "free" ? "무료" : "유료"} · 인원 ${c.memberCount || 0}명 · 코드 ${escapeHtml(c.code || "-")}</div>
      </div>
    `;
    listEl.appendChild(card);
  });
}

async function approveChurch(churchId) {
  const church = superadminChurches.find((c) => c.id === churchId);
  await db.collection("churches").doc(churchId).update({ status: "approved" });

  /* [신규] 안전장치 - 가입 시점에 문서 작성이 어떤 이유로든 누락됐더라도,
     승인하는 순간 신청자(ownerEmail)가 확실히 이 교회의 운영자가 되도록
     users/{email}.churchId 와 roles/{email} 컨텍스트를 다시 한 번 보정함 */
  if (church && church.ownerEmail) {
    try {
      await db.collection("users").doc(church.ownerEmail).set(
        { email: church.ownerEmail, churchId },
        { merge: true },
      );
      const roleRef = db.collection("roles").doc(church.ownerEmail);
      const roleDoc = await roleRef.get();
      const contexts = extractContexts(roleDoc.exists ? roleDoc.data() : null);
      if (!contexts.some((c) => c.role === "admin")) {
        await roleRef.set({ contexts: [...contexts, { role: "admin" }] });
      }
    } catch (e) {
      alert(
        "교회는 승인되었지만 신청자 권한 보정 중 문제가 발생했습니다: " +
          e.message,
      );
    }
  }

  await loadSuperadminChurches();
  renderSuperadminDashboard();
}

async function rejectChurch(churchId) {
  if (!confirm("이 교회의 가입 신청을 거절할까요?")) return;
  await db.collection("churches").doc(churchId).update({ status: "rejected" });
  await loadSuperadminChurches();
  renderSuperadminDashboard();
}
