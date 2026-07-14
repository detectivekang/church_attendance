function presentCount(serviceId) {
  const att = attendance[serviceId] || {};
  return members.filter((m) => normalizeRecord(att[m.id]).present).length;
}

function donationSum(serviceId) {
  const att = attendance[serviceId] || {};
  return members.reduce(
    (sum, m) => sum + normalizeRecord(att[m.id]).donation,
    0,
  );
}

/* [수정] 주차별 차트 렌더링 스케일 계산 알고리즘 및 탭 전환 연동 강화 */
function renderStats() {
  const totalServices = services.length;
  const totalMembers = members.length;
  let totalPresent = 0;
  services.forEach((s) => {
    totalPresent += presentCount(s.id);
  });
  const avgRate =
    totalServices > 0 && totalMembers > 0
      ? Math.round((totalPresent / (totalServices * totalMembers)) * 100)
      : 0;

  const showDonation = !!(currentGroupData && currentGroupData.trackDonation);
  const showBible = !!(currentGroupData && currentGroupData.trackBible);

  let extraCards = "";
  if (showDonation) {
    let totalDonation = 0;
    services.forEach((s) => {
      totalDonation += donationSum(s.id);
    });
    extraCards += `<div class="summary-card"><div class="num">${totalDonation.toLocaleString()}원</div><div class="lbl">누적 헌금액</div></div>`;
  }
  if (showBible) {
    let bibleSum = 0;
    members.forEach((m) => {
      let max = 0;
      services.forEach((s) => {
        const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
        if (rec.bible > max) max = rec.bible;
      });
      bibleSum += max;
    });
    const bibleAvg =
      totalMembers > 0 ? Math.round((bibleSum / totalMembers) * 10) / 10 : 0;
    extraCards += `<div class="summary-card"><div class="num">${bibleAvg}</div><div class="lbl">1인 평균 성경 진도(장)</div></div>`;
  }

  const cards = document.getElementById("summaryCards");
  cards.innerHTML = `
    <div class="summary-card"><div class="num">${totalMembers}</div><div class="lbl">등록 팀원 수</div></div>
    <div class="summary-card"><div class="num">${totalServices}</div><div class="lbl">진행된 예배 수</div></div>
    <div class="summary-card"><div class="num">${avgRate}%</div><div class="lbl">평균 출석률</div></div>
    ${extraCards}
  `;

  const chart = document.getElementById("weeklyChart");
  chart.innerHTML = "";
  const sorted = [...services].sort((a, b) => a.date.localeCompare(b.date));

  // 실제 스케일 상 최대값 구하기 (0명일 때를 감안하여 최소 1로 설정)
  const maxCount = Math.max(1, ...sorted.map((s) => presentCount(s.id)));

  // 차트 컴포넌트의 총 높이(200px) 중 상/하단 서체 배치 마진 공간 약 60px을 제외한 순수 최대 수용 높이(140px)
  const CHART_MAX_BAR_HEIGHT = 140;

  sorted.forEach((s) => {
    const count = presentCount(s.id);

    // 최대 참석값 대비 현재 주차의 높이 비율 연산 (상한선을 넘지 않아 짤림 차단)
    const h = Math.max(
      4,
      Math.round((count / maxCount) * CHART_MAX_BAR_HEIGHT),
    );

    const wrap = document.createElement("div");
    wrap.className = "week-bar-wrap";
    wrap.dataset.serviceId = s.id; // 클릭 처리를 위한 데이터셋 설정
    wrap.innerHTML = `
      <div class="week-count">${count}명</div>
      <div class="week-bar" style="height:${h}px;"></div>
      <div class="week-label">${s.date.slice(5)}</div>
    `;

    // 주차별 차트 막대 클릭 시 해당 날짜의 출석체크 화면으로 유동적 이동 처리
    wrap.addEventListener("click", () => {
      currentServiceId = wrap.dataset.serviceId;

      // 1. 드롭다운(select) 매핑 동기화
      const sel = document.getElementById("serviceSelect");
      if (sel) sel.value = currentServiceId;

      // 2. 출석체크 데이터 목록 갱신
      renderAttendList();

      // 3. 탭 UI 활성화 타겟 변경
      document
        .querySelectorAll("#main-groupdetail .tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll("#main-groupdetail .view")
        .forEach((v) => v.classList.remove("active"));

      document
        .querySelector('#main-groupdetail .tab[data-view="attend"]')
        .classList.add("active");
      document.getElementById("view-attend").classList.add("active");
    });

    chart.appendChild(wrap);
  });

  if (sorted.length === 0) {
    chart.innerHTML = '<div class="empty">예배 기록이 없습니다.</div>';
  } else {
    requestAnimationFrame(() => {
      chart.scrollLeft = chart.scrollWidth;
    });
  }

  renderMonthBirthdays();

  const statList = document.getElementById("statList");
  statList.innerHTML = "";
  if (members.length === 0) {
    statList.innerHTML = '<div class="empty">등록된 팀원이 없습니다.</div>';
    renderYearlyStats();
    return;
  }
  /* 출석률 랭킹은 의미가 있는 정렬 기준이라 퍼센트 내림차순을 유지하되,
     퍼센트가 같을 때는 이름 가나다순으로 정렬 */
  const memberStats = members
    .map((m) => {
      let present = 0;
      let donation = 0;
      let bibleMax = 0;
      services.forEach((s) => {
        const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
        if (rec.present) present++;
        donation += rec.donation;
        if (rec.bible > bibleMax) bibleMax = rec.bible;
      });
      const pct =
        totalServices > 0 ? Math.round((present / totalServices) * 100) : 0;
      return { m, pct, present, donation, bibleMax };
    })
    .sort((a, b) => b.pct - a.pct || a.m.name.localeCompare(b.m.name, "ko"));

  memberStats.forEach(({ m, pct, donation, bibleMax }) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    let extra = "";
    if (showDonation || showBible) {
      extra = `<div class="stat-extra">
        ${showDonation ? `<span>헌금 <b>${donation.toLocaleString()}</b>원</span>` : ""}
        ${showBible ? `<span>성경 <b>${bibleMax}</b>장</span>` : ""}
      </div>`;
    }
    row.innerHTML = `
      <div class="stat-name">${escapeHtml(m.name)}${m.isLeader ? '<span class="leader-tag">팀장</span>' : ""}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
      <div class="stat-pct">${pct}%</div>
      ${extra}
    `;
    statList.appendChild(row);
  });
  renderYearlyStats();
}

/* 팀(그룹) 상세 통계 화면용 - 이름(생일)만 표시 */
function renderMonthBirthdays() {
  const el = document.getElementById("statsBirthdayList");
  if (!el) return;
  const list = members
    .filter((m) => isBirthdayInCurrentMonth(m.birthday))
    .sort((a, b) => birthdayDay(a.birthday) - birthdayDay(b.birthday));
  if (list.length === 0) {
    el.innerHTML = '<div class="empty">이번 달 생일자가 없습니다.</div>';
    return;
  }
  el.innerHTML = `<div class="birthday-list">${list
    .map(
      (m) =>
        `<div class="birthday-item">🎂 ${escapeHtml(m.name)}(${escapeHtml(fmtBirthday(m.birthday))})</div>`,
    )
    .join("")}</div>`;
}

function renderYearlyStats() {
  const container = document.getElementById("yearlyStats");
  if (!container) return;

  const years = [...new Set(services.map((s) => s.date.substring(0, 4)))];
  let html = "";

  years.forEach((year) => {
    const yearServices = services.filter((s) => s.date.startsWith(year));
    const totalWeeks = yearServices.length;

    const perfect = [];
    const oneMiss = [];

    members.forEach((member) => {
      let present = 0;
      yearServices.forEach((service) => {
        if (normalizeRecord((attendance[service.id] || {})[member.id]).present)
          present++;
      });
      const absent = totalWeeks - present;
      if (absent === 0) perfect.push(member.name);
      if (absent === 1) oneMiss.push(member.name);
    });

    let totalAttendance = 0;
    yearServices.forEach((service) => {
      totalAttendance += presentCount(service.id);
    });
    const avg = totalWeeks > 0 ? Math.round(totalAttendance / totalWeeks) : 0;

    html += `
      <div class="summary-card" style="margin-bottom:20px;">
        <h3 style="margin-top:0;">${year}년</h3>
        <p style="font-size:13px; color:var(--ink-soft);">
          총 진행 예배 : ${totalWeeks}회<br>
          주차별 평균 참석 : ${avg}명
        </p>
        <hr style="border:0; border-top:1px dashed var(--paper-line); margin:12px 0;">
        <b style="color:var(--stamp-red);">🏆 개근자 (${perfect.length}명)</b>
        <div style="margin:6px 0 14px; font-size:14px; font-weight:500;">
          ${perfect.length ? perfect.map(escapeHtml).join(", ") : '<span style="color:var(--absent-gray); font-style:italic;">없음</span>'}
        </div>
        <b style="color:var(--present-green);">👍 정근자 · 1회 결석 (${oneMiss.length}명)</b>
        <div style="margin-top:6px; font-size:14px; font-weight:500;">
          ${oneMiss.length ? oneMiss.map(escapeHtml).join(", ") : '<span style="color:var(--absent-gray); font-style:italic;">없음</span>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
