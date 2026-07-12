/* =========================================================
   화면 전환 & 뒤로가기(Back) 버튼 대응
   - 화면 전환마다 history state를 쌓아 두어, 모바일/브라우저의
   뒤로가기가 앱을 이탈해 로그인 화면으로 튕기지 않고
   카테고리 > 그룹 > 그룹상세 단계를 자연스럽게 오가도록 함.
   - bfcache로 인해 예전 화면이 그대로 복원되는 경우를 막기 위해
   pageshow에서 강제로 새로고침.
   ========================================================= */
function showMain(name) {
  document
    .querySelectorAll(".mainview")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("main-" + name).classList.add("active");
}

function navigateTo(state, replace) {
  try {
    if (replace) history.replaceState(state, "");
    else history.pushState(state, "");
  } catch (e) {}
}

async function restoreNavState(state) {
  if (!currentUser) return;
  if (!state || !state.level) {
    await initRoleView();
    return;
  }
  if (state.level === "categories") {
    selectedCategoryId = null;
    selectedGroupId = null;
    currentGroupData = null;
    renderBreadcrumb();
    await renderCategoriesView();
    showMain("categories");
  } else if (state.level === "groups") {
    selectedCategoryId = state.categoryId;
    selectedGroupId = null;
    currentGroupData = null;
    await loadGroups(selectedCategoryId);
    renderBreadcrumb();
    await renderGroupsView();
    showMain("groups");
  } else if (state.level === "groupdetail") {
    await enterGroup(state.groupId, { skipHistory: true });
  } else {
    await initRoleView();
  }
}

window.addEventListener("popstate", (e) => {
  restoreNavState(e.state);
});

window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    location.reload();
  }
});

/* =========================================================
   상단 브레드크럼(카테고리 / 그룹 / 그룹상세 경로 표시)
   ========================================================= */
function categoryNameOf(id) {
  return (categoriesCache[id] || {}).name || "카테고리";
}

function renderBreadcrumb() {
  const el = document.getElementById("breadcrumb");
  if (selectedGroupId && currentGroupData) {
    if (currentRole === "admin") {
      el.innerHTML = `<span class="crumb-link" id="crumbCategories">카테고리</span> / <span class="crumb-link" id="crumbGroups">${escapeHtml(categoryNameOf(currentGroupData.categoryId))}</span> / <b>${escapeHtml(currentGroupData.name)}</b>`;
    } else if (currentRole === "operator") {
      el.innerHTML = `<span class="crumb-link" id="crumbGroups">${escapeHtml(categoryNameOf(selectedCategoryId))} · 그룹 목록</span> / <b>${escapeHtml(currentGroupData.name)}</b>`;
    } else {
      el.innerHTML = `<b>${escapeHtml(currentGroupData.name)}</b>`;
    }
  } else if (selectedCategoryId) {
    if (currentRole === "admin") {
      el.innerHTML = `<span class="crumb-link" id="crumbCategories">카테고리</span> / <b>${escapeHtml(categoryNameOf(selectedCategoryId))}</b>`;
    } else {
      el.innerHTML = `<b>${escapeHtml(categoryNameOf(selectedCategoryId))}</b>`;
    }
  } else {
    el.innerHTML = currentRole === "admin" ? "<b>카테고리 관리</b>" : "";
  }

  const cCrumb = document.getElementById("crumbCategories");
  if (cCrumb)
    cCrumb.addEventListener("click", async () => {
      selectedCategoryId = null;
      selectedGroupId = null;
      currentGroupData = null;
      renderBreadcrumb();
      await renderCategoriesView();
      showMain("categories");
      navigateTo({ level: "categories" });
    });
  const gCrumb = document.getElementById("crumbGroups");
  if (gCrumb)
    gCrumb.addEventListener("click", async () => {
      selectedGroupId = null;
      currentGroupData = null;
      renderBreadcrumb();
      await renderGroupsView();
      showMain("groups");
      navigateTo({ level: "groups", categoryId: selectedCategoryId });
    });
}

/* =========================================================
   권한별 최초 진입 화면 라우팅
   ========================================================= */
async function initRoleView() {
  selectedCategoryId = null;
  selectedGroupId = null;

  if (currentRole === "admin") {
    await loadCategories();
    renderBreadcrumb();
    await renderCategoriesView();
    showMain("categories");
    navigateTo({ level: "categories" }, true);
  } else if (currentRole === "operator") {
    selectedCategoryId = roleScope.categoryId;
    try {
      const catDoc = await db
        .collection("categories")
        .doc(selectedCategoryId)
        .get();
      if (catDoc.exists)
        categoriesCache[catDoc.id] = { id: catDoc.id, ...catDoc.data() };
    } catch (e) {}
    await loadGroups(selectedCategoryId);
    renderBreadcrumb();
    await renderGroupsView();
    showMain("groups");
    navigateTo({ level: "groups", categoryId: selectedCategoryId }, true);
  } else if (currentRole === "leader") {
    await enterGroup(roleScope.groupId, { skipHistory: true });
    navigateTo({ level: "groupdetail", groupId: roleScope.groupId }, true);
  } else {
    document.getElementById("pendingEmail").textContent = currentUser.email;
    renderBreadcrumb();
    showMain("pending");
    navigateTo({ level: "pending" }, true);
  }
}
