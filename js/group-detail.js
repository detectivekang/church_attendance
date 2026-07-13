/* =========================================================
   그룹 상세 화면
   ========================================================= */
async function enterGroup(groupId, opts = {}) {
  selectedGroupId = groupId;
  const gdoc = await db.collection("groups").doc(groupId).get();
  if (!gdoc.exists) {
    alert("그룹 정보를 찾을 수 없습니다.");
    return;
  }
  currentGroupData = { id: groupId, ...gdoc.data() };

  if (
    currentRole !== "admin" &&
    !categoriesCache[currentGroupData.categoryId]
  ) {
    try {
      const catDoc = await db
        .collection("categories")
        .doc(currentGroupData.categoryId)
        .get();
      if (catDoc.exists)
        categoriesCache[catDoc.id] = { id: catDoc.id, ...catDoc.data() };
    } catch (e) {}
  }

  selectedYear = new Date().getFullYear();
  services = generateSundaysForYear(selectedYear);
  await Promise.all([loadMembers(groupId), loadAttendanceForServices()]);

  const today = todayStr();
  const closest = services.reduce(
    (prev, curr) => {
      return Math.abs(new Date(curr.date) - new Date(today)) <
        Math.abs(new Date(prev.date) - new Date(today))
        ? curr
        : prev;
    },
    services[0] || { id: null },
  );
  currentServiceId = closest.id;

  document.getElementById("memberForm").style.display = canManageMembers()
    ? "flex"
    : "none";
  document.getElementById("trackSettings").style.display = canManageMembers()
    ? "flex"
    : "none";
  document.getElementById("openMemberExcelUploadBtn").style.display =
    canManageMembers() ? "inline-block" : "none";
  document.getElementById("openAttendanceExcelUploadBtn").style.display =
    canEditAttendance() ? "inline-block" : "none";
  document.getElementById("attendDesc").textContent = canEditAttendance()
    ? "예배를 선택하고 이름을 눌러 출석 도장을 찍으세요."
    : "예배별 출결 현황입니다. (조회 전용)";
  document.getElementById("membersDesc").textContent = canManageMembers()
    ? "팀원을 등록하고 관리하세요."
    : "이 그룹에 소속된 팀원 명단입니다. (조회 전용)";

  document.getElementById("trackDonationToggle").checked =
    !!currentGroupData.trackDonation;
  document.getElementById("trackBibleToggle").checked =
    !!currentGroupData.trackBible;
  document.getElementById("trackLeaderToggle").checked =
    !!currentGroupData.includeLeaderAttendance;

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

  editingMemberId = null;
  renderBreadcrumb();
  renderYearSelect();
  renderServiceSelect();
  renderAttendList();
  renderMembers();
  renderStats();
  showMain("groupdetail");

  if (!opts.skipHistory) {
    navigateTo({ level: "groupdetail", groupId: groupId });
  }
}

/* =========================================================
   출석체크 연도 선택
   ========================================================= */
function renderYearSelect() {
  const selects = document.querySelectorAll(".yearSelect"); // 클래스로 모든 요소 선택
  selects.forEach((sel) => {
    sel.innerHTML = "";
    getYearOptions().forEach((y) => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y + "년";
      if (y == selectedYear) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

document.querySelectorAll(".yearSelect").forEach((element) => {
  element.addEventListener("change", async (e) => {
    const selectedYear = Number(e.target.value);

    // 1. 모든 .yearSelect 요소의 값을 동일하게 맞춤
    document.querySelectorAll(".yearSelect").forEach((select) => {
      select.value = selectedYear;
    });

    services = generateSundaysForYear(selectedYear);
    await loadAttendanceForServices();

    const sorted = [...services].sort((a, b) => b.date.localeCompare(a.date));
    currentServiceId = sorted.length ? sorted[0].id : null;

    renderServiceSelect();
    renderAttendList();
    renderStats();
  });
});

document
  .getElementById("trackDonationToggle")
  .addEventListener("change", async (e) => {
    if (!canManageMembers() || !selectedGroupId) return;
    const val = e.target.checked;
    currentGroupData.trackDonation = val;
    await db
      .collection("groups")
      .doc(selectedGroupId)
      .update({ trackDonation: val });
    renderAttendList();
    renderStats();
  });

document
  .getElementById("trackBibleToggle")
  .addEventListener("change", async (e) => {
    if (!canManageMembers() || !selectedGroupId) return;
    const val = e.target.checked;
    currentGroupData.trackBible = val;
    await db
      .collection("groups")
      .doc(selectedGroupId)
      .update({ trackBible: val });
    renderAttendList();
    renderStats();
  });

/* [신규] 팀장 출석 관리 사용/해지 토글
   켜면 팀장도 팀원명부/출석체크/통계에 가상 항목으로 포함되고,
   끄면 다시 실제 팀원만 표시됨. members 컬렉션 자체는 건드리지 않음. */
document
  .getElementById("trackLeaderToggle")
  .addEventListener("change", async (e) => {
    if (!canManageMembers() || !selectedGroupId) return;
    const val = e.target.checked;
    currentGroupData.includeLeaderAttendance = val;
    await db
      .collection("groups")
      .doc(selectedGroupId)
      .update({ includeLeaderAttendance: val });
    editingMemberId = null;
    await loadMembers(selectedGroupId);
    renderMembers();
    renderAttendList();
    renderStats();
  });
