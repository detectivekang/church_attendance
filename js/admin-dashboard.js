/* =========================================================
   [신규] 운영자 전용 대시보드 - 모든 카테고리·그룹을 합산한 전체 통계
   ========================================================= */
let adminDashboardDetailData = [];

async function renderAdminDashboard() {
  const summaryEl = document.getElementById("adminDashboardSummary");
  const bdayEl = document.getElementById("adminDashboardBirthdayList");
  const detailWrap = document.getElementById("adminDashboardDetailWrap");
  if (!summaryEl) return;
  summaryEl.innerHTML = '<div class="empty">불러오는 중...</div>';
  bdayEl.innerHTML = "";
  detailWrap.innerHTML = "";

  try {
    const [categorySnap, groupSnap] = await Promise.all([
      churchCol("categories").get(),
      churchCol("groups").get(),
    ]);
    const allCategories = categorySnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    const categoryNameMap = Object.fromEntries(
      allCategories.map((c) => [c.id, c.name]),
    );
    const allGroups = groupSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (allGroups.length === 0) {
      summaryEl.innerHTML = `
        <div class="summary-card"><div class="num">${allCategories.length}</div><div class="lbl">전체 카테고리 수</div></div>
        <div class="summary-card"><div class="num">0</div><div class="lbl">전체 그룹 수</div></div>
      `;
      bdayEl.innerHTML = '<div class="empty">이번 달 생일자가 없습니다.</div>';
      detailWrap.innerHTML = '<div class="empty">등록된 그룹이 없습니다.</div>';
      adminDashboardDetailData = [];
      return;
    }

    const memberSnaps = await Promise.all(
      allGroups.map((g) => churchCol("members").where("groupId", "==", g.id).get()),
    );
    const allMembers = [];
    const membersByGroup = {};
    allGroups.forEach((g, i) => {
      const list = memberSnaps[i].docs.map((d) => ({
        id: d.id,
        ...d.data(),
        groupId: g.id,
        groupName: g.name,
        categoryId: g.categoryId,
      }));
      membersByGroup[g.id] = list;
      allMembers.push(...list);
    });

    const year = new Date().getFullYear();
    const yearServices = generateSundaysForYear(year);
    const attSnaps = await Promise.all(
      yearServices.map((s) => churchCol("attendance").doc(s.id).get()),
    );
    const yearAttendance = {};
    yearServices.forEach((s, i) => {
      yearAttendance[s.id] = attSnaps[i].exists ? attSnaps[i].data() : {};
    });

    let totalPresent = 0;
    let totalDonation = 0;
    const groupsWithDonation = new Set(
      allGroups.filter((g) => g.trackDonation).map((g) => g.id),
    );
    allMembers.forEach((m) => {
      yearServices.forEach((s) => {
        const rec = normalizeRecord((yearAttendance[s.id] || {})[m.id]);
        if (rec.present) totalPresent++;
        if (groupsWithDonation.has(m.groupId)) totalDonation += rec.donation;
      });
    });

    const totalMembers = allMembers.length;
    const totalServices = yearServices.length;
    const avgRate =
      totalServices > 0 && totalMembers > 0
        ? Math.round((totalPresent / (totalServices * totalMembers)) * 100)
        : 0;

    summaryEl.innerHTML = `
      <div class="summary-card"><div class="num">${allCategories.length}</div><div class="lbl">전체 카테고리 수</div></div>
      <div class="summary-card"><div class="num">${allGroups.length}</div><div class="lbl">전체 그룹 수</div></div>
      <div class="summary-card"><div class="num">${totalMembers}</div><div class="lbl">전체 팀원 수</div></div>
      <div class="summary-card"><div class="num">${avgRate}%</div><div class="lbl">${year}년 평균 출석률</div></div>
      ${
        totalDonation > 0
          ? `<div class="summary-card"><div class="num">${totalDonation.toLocaleString()}원</div><div class="lbl">누적 헌금액</div></div>`
          : ""
      }
    `;

    const bdayList = allMembers
      .filter((m) => isBirthdayInCurrentMonth(m.birthday))
      .sort((a, b) => birthdayDay(a.birthday) - birthdayDay(b.birthday));
    if (bdayList.length === 0) {
      bdayEl.innerHTML = '<div class="empty">이번 달 생일자가 없습니다.</div>';
    } else {
      bdayEl.innerHTML = `<div class="birthday-list">${bdayList
        .map(
          (m) =>
            `<div class="birthday-item"><span class="grp">${escapeHtml(categoryNameMap[m.categoryId] || "")} · ${escapeHtml(m.groupName)}</span> - ${escapeHtml(m.name)}(${escapeHtml(fmtBirthday(m.birthday))})</div>`,
        )
        .join("")}</div>`;
    }

    const latestService = [...yearServices].sort((a, b) =>
      b.date.localeCompare(a.date),
    )[0];
    adminDashboardDetailData = allGroups.map((g) => {
      const groupMembers = membersByGroup[g.id] || [];
      let present = 0;
      groupMembers.forEach((m) => {
        yearServices.forEach((s) => {
          if (normalizeRecord((yearAttendance[s.id] || {})[m.id]).present)
            present++;
        });
      });
      const rate =
        yearServices.length > 0 && groupMembers.length > 0
          ? Math.round((present / (yearServices.length * groupMembers.length)) * 100)
          : 0;
      let latestPresent = 0;
      if (latestService) {
        groupMembers.forEach((m) => {
          if (normalizeRecord((yearAttendance[latestService.id] || {})[m.id]).present)
            latestPresent++;
        });
      }
      let donation = 0;
      if (g.trackDonation) {
        groupMembers.forEach((m) => {
          yearServices.forEach((s) => {
            donation += normalizeRecord((yearAttendance[s.id] || {})[m.id]).donation;
          });
        });
      }
      return {
        group: g,
        categoryName: categoryNameMap[g.categoryId] || "-",
        memberCount: groupMembers.length,
        rate,
        latestPresent,
        latestTotal: groupMembers.length,
        donation,
      };
    });
    adminDashboardDetailData = sortByName(
      adminDashboardDetailData,
      (x) => x.group.name,
    );
    renderAdminDashboardDetailTable();
  } catch (e) {
    summaryEl.innerHTML = '<div class="empty">현황을 불러오지 못했습니다.</div>';
    adminDashboardDetailData = [];
  }
}

function renderAdminDashboardDetailTable() {
  const wrap = document.getElementById("adminDashboardDetailWrap");
  if (!wrap) return;
  if (adminDashboardDetailData.length === 0) {
    wrap.innerHTML = '<div class="empty">표시할 그룹이 없습니다.</div>';
    return;
  }
  const anyDonation = adminDashboardDetailData.some((d) => d.group.trackDonation);
  wrap.innerHTML = `
    <div class="detail-stats-wrap">
    <table class="detail-stats-table">
      <thead>
        <tr>
          <th>카테고리</th>
          <th>그룹</th>
          <th>팀원수</th>
          <th>최근 예배 출석</th>
          <th>연간 평균 출석률</th>
          ${anyDonation ? "<th>누적 헌금</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${adminDashboardDetailData
          .map(
            (d) => `
          <tr class="detail-row" data-id="${d.group.id}" data-category="${d.group.categoryId}">
            <td>${escapeHtml(d.categoryName)}</td>
            <td>${escapeHtml(d.group.name)}</td>
            <td class="num">${d.memberCount}명</td>
            <td class="num">${d.latestPresent}/${d.latestTotal}</td>
            <td class="num">${d.rate}%</td>
            ${anyDonation ? `<td class="num">${d.group.trackDonation ? d.donation.toLocaleString() + "원" : "-"}</td>` : ""}
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    </div>
  `;
  wrap.querySelectorAll(".detail-row").forEach((row) => {
    row.addEventListener("click", () => {
      goToGroupFromDashboard(row.dataset.id, row.dataset.category);
    });
  });
}
