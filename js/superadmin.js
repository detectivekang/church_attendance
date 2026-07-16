/* =========================================================
   슈퍼관리자(관리자, kangseabich@naver.com 전용) 대시보드
   - 특정 교회에 속하지 않고, 가입된 모든 교회를 한눈에 관리함
   - [수정] 교회 가입 시 승인 절차가 사라졌으므로, 승인 대기/승인/거절 UI는
     제거하고 등록된 교회 목록과 요금제(무료/유료) 사용 현황만 보여줌
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
  const churches = sortByName(superadminChurches);
  const paidCount = superadminChurches.filter((c) => c.plan === "paid").length;

  /* 요약 카드 */
  document.getElementById("superadminSummary").innerHTML = `
    <div class="summary-card"><div class="num">${superadminChurches.length}</div><div class="lbl">등록된 교회</div></div>
    <div class="summary-card"><div class="num">${paidCount}</div><div class="lbl">유료 요금제 사용 교회</div></div>
    <div class="summary-card"><div class="num">${superadminChurches.reduce((s, c) => s + (c.memberCount || 0), 0)}</div><div class="lbl">전체 가입 인원</div></div>
  `;

  /* 등록된 교회 목록 */
  const listEl = document.getElementById("superadminChurchList");
  listEl.innerHTML = "";
  if (churches.length === 0) {
    listEl.innerHTML = '<div class="empty">등록된 교회가 없습니다.</div>';
    return;
  }
  churches.forEach((c) => {
    const card = document.createElement("div");
    card.className = "list-card";
    card.innerHTML = `
      <div class="list-card-main">
        <div class="list-card-title">${escapeHtml(c.name || "(이름 없음)")}</div>
        <div class="list-card-sub">요금제: ${c.plan === "paid" ? "유료" : "무료"} · 인원 ${c.memberCount || 0}명 · 코드 ${escapeHtml(c.code || "-")}</div>
      </div>
    `;
    listEl.appendChild(card);
  });
}
