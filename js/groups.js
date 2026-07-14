/* =========================================================
   그룹 관리
   ========================================================= */
function normalizeLeaderEmails(g) {
  if (Array.isArray(g.leaderEmails)) return g.leaderEmails.filter(Boolean);
  if (g.leaderEmail) return [g.leaderEmail];
  return [];
}

async function loadGroups(categoryId) {
  const snap = await db
    .collection("groups")
    .where("categoryId", "==", categoryId)
    .get();
  groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function renderGroupsView() {
  document.getElementById("groupsTitle").textContent =
    categoryNameOf(selectedCategoryId) + " · 그룹 관리";
  document.getElementById("addGroupForm").style.display = canManageGroups()
    ? "flex"
    : "none";

  categoryDetailOpen = false;
  document.getElementById("categoryDetailWrap").style.display = "none";
  document.getElementById("categoryDetailToggle").textContent =
    "▾ 전체 그룹 상세 출석/통계 보기";

  await renderCategoryOverview();

  const list = document.getElementById("groupList");
  list.innerHTML = "";
  if (groups.length === 0) {
    list.innerHTML = '<div class="empty">등록된 그룹이 없습니다.</div>';
    return;
  }

  const memberCountMap = {};
  const countPromises = groups.map(async (g) => {
    const snap = await db
      .collection("members")
      .where("groupId", "==", g.id)
      .get();
    memberCountMap[g.id] = snap.size;
  });
  await Promise.all(countPromises);

  /* [신규] 그룹도 이름 가나다순으로 표시 */
  const sortedGroups = sortByName(groups);

  sortedGroups.forEach((g) => {
    const card = document.createElement("div");
    card.className = "list-card";

    if (editingGroupId === g.id) {
      card.innerHTML = `
        <div class="inline-edit-form">
          <input type="text" class="edit-group-name" value="${escapeHtml(g.name)}" placeholder="그룹 이름" />
          <button class="btn small edit-group-save" data-id="${g.id}">저장</button>
          <button class="btn ghost small edit-group-cancel">취소</button>
        </div>
      `;
      list.appendChild(card);
      return;
    }

    const leaderEmails = normalizeLeaderEmails(g);
    const leaderLabel = leaderEmails.length
      ? leaderEmails.map((e) => escapeHtml(userLabel(e))).join(", ")
      : "미지정";
    card.innerHTML = `
      <div class="list-card-main" data-id="${g.id}">
        <div class="list-card-title">${escapeHtml(g.name)}</div>
        <div class="list-card-sub">팀장: ${leaderLabel} · 팀원 ${memberCountMap[g.id] || 0}명${g.includeLeaderAttendance ? ' <span class="leader-tag">팀장 출석 관리</span>' : ""}</div>
      </div>
      <div class="list-card-actions">
        ${
          canManageGroups()
            ? `<button class="btn ghost small" data-edit="${g.id}">수정</button>
        <button class="btn ghost small" data-assign="${g.id}">팀장 지정</button>
        <button class="btn danger" data-del="${g.id}">삭제</button>`
            : ""
        }
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".list-card-main").forEach((el) => {
    el.addEventListener("click", () => enterGroup(el.dataset.id));
  });
  list.querySelectorAll("[data-assign]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      assignLeaders(btn.dataset.assign);
    });
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteGroup(btn.dataset.del);
    });
  });
  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingGroupId = btn.dataset.edit;
      renderGroupsView();
    });
  });
  list.querySelectorAll(".edit-group-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingGroupId = null;
      renderGroupsView();
    });
  });
  list.querySelectorAll(".edit-group-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const form = btn.closest(".inline-edit-form");
      const name = form.querySelector(".edit-group-name").value.trim();
      if (!name) {
        form.querySelector(".edit-group-name").focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "저장 중...";
      try {
        await db.collection("groups").doc(id).update({ name });
        editingGroupId = null;
        await loadGroups(selectedCategoryId);
        await renderGroupsView();
      } catch (err) {
        alert("수정 중 에러가 발생했습니다: " + err.message);
        btn.disabled = false;
        btn.textContent = "저장";
      }
    });
  });
}

/* =========================================================
   카테고리(그룹 목록 단계) 전체 출석 현황 / 생일자 요약
   + [신규] 전체 그룹 상세 출석/통계 테이블
   - 팀까지 들어가지 않아도 모든 그룹의 현황을 한 번에 확인 가능
   ========================================================= */
async function renderCategoryOverview() {
  const cardsEl = document.getElementById("categorySummaryCards");
  const bdayEl = document.getElementById("categoryBirthdayList");
  if (!cardsEl || !bdayEl) return;
  if (!selectedCategoryId || groups.length === 0) {
    cardsEl.innerHTML = '<div class="empty">등록된 그룹이 없습니다.</div>';
    bdayEl.innerHTML = "";
    categoryDetailData = [];
    return;
  }
  cardsEl.innerHTML = '<div class="empty">불러오는 중...</div>';
  bdayEl.innerHTML = "";

  try {
    const memberSnaps = await Promise.all(
      groups.map((g) =>
        db.collection("members").where("groupId", "==", g.id).get(),
      ),
    );
    const allMembers = [];
    const membersByGroup = {};
    groups.forEach((g, i) => {
      const list = memberSnaps[i].docs.map((d) => ({
        id: d.id,
        ...d.data(),
        groupId: g.id,
        groupName: g.name,
      }));
      membersByGroup[g.id] = list;
      allMembers.push(...list);
    });

    const overviewYear = new Date().getFullYear();
    const overviewServices = generateSundaysForYear(overviewYear);
    const attSnaps = await Promise.all(
      overviewServices.map((s) =>
        db.collection("attendance").doc(s.id).get(),
      ),
    );
    const overviewAttendance = {};
    overviewServices.forEach((s, i) => {
      overviewAttendance[s.id] = attSnaps[i].exists ? attSnaps[i].data() : {};
    });

    let totalPresent = 0;
    let totalDonation = 0;
    const groupsWithDonation = new Set(
      groups.filter((g) => g.trackDonation).map((g) => g.id),
    );
    allMembers.forEach((m) => {
      overviewServices.forEach((s) => {
        const rec = normalizeRecord((overviewAttendance[s.id] || {})[m.id]);
        if (rec.present) totalPresent++;
        if (groupsWithDonation.has(m.groupId)) totalDonation += rec.donation;
      });
    });

    const totalMembers = allMembers.length;
    const totalServices = overviewServices.length;
    const avgRate =
      totalServices > 0 && totalMembers > 0
        ? Math.round((totalPresent / (totalServices * totalMembers)) * 100)
        : 0;

    cardsEl.innerHTML = `
      <div class="summary-card"><div class="num">${groups.length}</div><div class="lbl">전체 그룹 수</div></div>
      <div class="summary-card"><div class="num">${totalMembers}</div><div class="lbl">전체 팀원 수</div></div>
      <div class="summary-card"><div class="num">${avgRate}%</div><div class="lbl">${overviewYear}년 평균 출석률</div></div>
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
      bdayEl.innerHTML =
        '<div class="empty">이번 달 생일자가 없습니다.</div>';
    } else {
      bdayEl.innerHTML = `<div class="birthday-list">${bdayList
        .map(
          (m) =>
            `<div class="birthday-item"><span class="grp">${escapeHtml(m.groupName)}</span> - ${escapeHtml(m.name)}(${escapeHtml(fmtBirthday(m.birthday))})</div>`,
        )
        .join("")}</div>`;
    }

    /* [신규] 그룹별 상세 통계 계산 (요약에서 보이지 않던 그룹 단위 디테일) */
    const latestService = [...overviewServices].sort((a, b) =>
      b.date.localeCompare(a.date),
    )[0];
    categoryDetailData = groups.map((g) => {
      const groupMembers = membersByGroup[g.id] || [];
      let present = 0;
      groupMembers.forEach((m) => {
        overviewServices.forEach((s) => {
          if (normalizeRecord((overviewAttendance[s.id] || {})[m.id]).present)
            present++;
        });
      });
      const rate =
        overviewServices.length > 0 && groupMembers.length > 0
          ? Math.round(
              (present / (overviewServices.length * groupMembers.length)) *
                100,
            )
          : 0;
      let latestPresent = 0;
      if (latestService) {
        groupMembers.forEach((m) => {
          if (
            normalizeRecord((overviewAttendance[latestService.id] || {})[m.id])
              .present
          )
            latestPresent++;
        });
      }
      let donation = 0;
      if (g.trackDonation) {
        groupMembers.forEach((m) => {
          overviewServices.forEach((s) => {
            donation += normalizeRecord((overviewAttendance[s.id] || {})[m.id])
              .donation;
          });
        });
      }
      let bibleAvg = 0;
      if (g.trackBible && groupMembers.length > 0) {
        let sum = 0;
        groupMembers.forEach((m) => {
          let max = 0;
          overviewServices.forEach((s) => {
            const b = normalizeRecord((overviewAttendance[s.id] || {})[m.id])
              .bible;
            if (b > max) max = b;
          });
          sum += max;
        });
        bibleAvg = Math.round((sum / groupMembers.length) * 10) / 10;
      }
      return {
        group: g,
        memberCount: groupMembers.length,
        rate,
        latestPresent,
        latestTotal: groupMembers.length,
        donation,
        bibleAvg,
      };
    });
    categoryDetailData = sortByName(categoryDetailData, (x) => x.group.name);
    if (categoryDetailOpen) renderCategoryDetailTable();
  } catch (e) {
    cardsEl.innerHTML = '<div class="empty">현황을 불러오지 못했습니다.</div>';
    categoryDetailData = [];
  }
}

/* [신규] 전체 그룹 상세 출석/통계 테이블 렌더링 (요약 카드만으로는 볼 수 없던
   그룹별 세부 수치를 한 화면에서 확인) */
function renderCategoryDetailTable() {
  const wrap = document.getElementById("categoryDetailWrap");
  if (!wrap) return;
  if (categoryDetailData.length === 0) {
    wrap.innerHTML = '<div class="empty">표시할 그룹이 없습니다.</div>';
    return;
  }
  const anyDonation = categoryDetailData.some((d) => d.group.trackDonation);
  const anyBible = categoryDetailData.some((d) => d.group.trackBible);
  wrap.innerHTML = `
    <table class="detail-stats-table">
      <thead>
        <tr>
          <th>그룹</th>
          <th>팀원수</th>
          <th>최근 예배 출석</th>
          <th>연간 평균 출석률</th>
          ${anyDonation ? "<th>누적 헌금</th>" : ""}
          ${anyBible ? "<th>1인 평균 성경(장)</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${categoryDetailData
          .map(
            (d) => `
          <tr class="detail-row" data-id="${d.group.id}">
            <td>${escapeHtml(d.group.name)}</td>
            <td class="num">${d.memberCount}명</td>
            <td class="num">${d.latestPresent}/${d.latestTotal}</td>
            <td class="num">${d.rate}%</td>
            ${anyDonation ? `<td class="num">${d.group.trackDonation ? d.donation.toLocaleString() + "원" : "-"}</td>` : ""}
            ${anyBible ? `<td class="num">${d.group.trackBible ? d.bibleAvg : "-"}</td>` : ""}
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll(".detail-row").forEach((row) => {
    row.addEventListener("click", () => enterGroup(row.dataset.id));
  });
}

document
  .getElementById("categoryDetailToggle")
  .addEventListener("click", () => {
    categoryDetailOpen = !categoryDetailOpen;
    const wrap = document.getElementById("categoryDetailWrap");
    const btn = document.getElementById("categoryDetailToggle");
    if (categoryDetailOpen) {
      wrap.style.display = "block";
      btn.textContent = "▴ 전체 그룹 상세 출석/통계 접기";
      renderCategoryDetailTable();
    } else {
      wrap.style.display = "none";
      btn.textContent = "▾ 전체 그룹 상세 출석/통계 보기";
    }
  });

document.getElementById("addGroupBtn").addEventListener("click", async (e) => {
  if (!canManageGroups() || !selectedCategoryId) return;
  const btn = e.target;
  const nameInput = document.getElementById("newGroupName");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "등록 중...";

  try {
    await db.collection("groups").add({
      name,
      categoryId: selectedCategoryId,
      leaderEmails: [],
      trackDonation: false,
      trackBible: false,
      includeLeaderAttendance: false,
      createdAt: Date.now(),
    });
    nameInput.value = "";
    await loadGroups(selectedCategoryId);
    await renderGroupsView();
  } catch (err) {
    alert("등록 중 에러가 발생했습니다: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

async function assignLeaders(groupId) {
  const g = groups.find((x) => x.id === groupId);
  const before = normalizeLeaderEmails(g);
  const result = await openUserPicker({
    title: "팀장 지정",
    sub: "가입된 사용자 중 이 그룹의 팀장을 선택하세요. (여러 명 선택 가능)",
    multi: true,
    selected: before,
  });
  if (result === null) return;
  const after = result;

  const removed = before.filter((e) => !after.includes(e));
  const added = after.filter((e) => !before.includes(e));

  for (const email of removed) {
    await removeRoleContext(email, { role: "leader", groupId: groupId }).catch(
      () => {},
    );
  }
  for (const email of added) {
    await addRoleContext(email, { role: "leader", groupId: groupId });
  }
  await db.collection("groups").doc(groupId).update({ leaderEmails: after });
  await loadGroups(selectedCategoryId);
  await renderGroupsView();
}

async function deleteGroup(groupId) {
  if (!confirm("이 그룹과 소속 팀원·출석 정보가 함께 삭제됩니다. 계속할까요?"))
    return;
  const memberSnap = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();
  await Promise.all(memberSnap.docs.map((m) => m.ref.delete()));
  const g = groups.find((x) => x.id === groupId);
  if (g) {
    const leaderEmails = normalizeLeaderEmails(g);
    for (const email of leaderEmails) {
      await removeRoleContext(email, {
        role: "leader",
        groupId: groupId,
      }).catch(() => {});
    }
  }
  await db.collection("groups").doc(groupId).delete();
  await loadGroups(selectedCategoryId);
  await renderGroupsView();
}
