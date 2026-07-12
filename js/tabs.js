/* =========================================================
   탭 전환 이벤트
   ========================================================= */
document.querySelectorAll("#main-groupdetail .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll("#main-groupdetail .tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll("#main-groupdetail .view")
      .forEach((v) => v.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("view-" + tab.dataset.view).classList.add("active");
    if (tab.dataset.view === "stats") renderStats();
    if (tab.dataset.view === "members") {
      editingMemberId = null;
      renderMembers();
    }
  });
});
