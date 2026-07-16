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
    if (currentRole === "superadmin") return enterSuperadminDashboard();
    //if (currentRole === "church_pending") return showMain("church-pending");
    await initRoleView();
    return;
  }
  if (state.level === "superadmin") {
    await enterSuperadminDashboard();
  } else if (state.level === "church-pending") {
    showMain("church-pending");
  } else if (state.level === "categories") {
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
    /* [신규] "교회 가입(운영자)"으로 들어온 사람이 무슨 이유로든 아직
       운영자 권한을 못 받은 경우엔, 남에게 권한을 받으라는 안내가 아니라
       관리자에게 문의하라는 안내를 보여줌 (본인이 곧 운영자가 될 사람이므로) */
    const isStuckOwner =
      currentChurchData && currentChurchData.ownerEmail === currentUser.email;
    document.getElementById("pendingRegularMsg").style.display = isStuckOwner
      ? "none"
      : "block";
    document.getElementById("pendingOwnerMsg").style.display = isStuckOwner
      ? "block"
      : "none";
    renderBreadcrumb();
    showMain("pending");
    navigateTo({ level: "pending" }, true);
  }
}

/* =========================================================
   [신규] 역할 선택 화면 (한 사람이 여러 역할을 가진 경우 로그인 직후 노출)
   ========================================================= */
function renderRolePicker() {
  const list = document.getElementById("rolePickerList");
  list.innerHTML = "";
  userContexts.forEach((ctx, i) => {
    const card = document.createElement("div");
    card.className = "list-card role-picker-card";
    card.innerHTML = `
      <div class="list-card-main">
        <div class="list-card-title">${escapeHtml(ctx.scopeName || "")}</div>
        <div class="list-card-sub">${escapeHtml(roleName(ctx.role))}로 입장</div>
      </div>
    `;
    card.addEventListener("click", async () => {
      activeContextIndex = i;
      applyActiveContext();
      await enterAppAfterRoleReady();
    });
    list.appendChild(card);
  });
}

/* =========================================================
   [신규] 화면 상단 "역할 전환" 스위처
   - 역할이 1개뿐이면 기존처럼 뱃지만 보이고 스위처는 숨김
   - 2개 이상이면 뱃지 옆에 전환 버튼이 나타나고, 클릭 시 드롭다운으로
   다른 역할 컨텍스트를 골라 화면 갈아타기 가능(로그아웃 불필요)
   ========================================================= */
function renderRoleSwitcher() {
  const wrap = document.getElementById("roleSwitcher");
  if (!wrap) return;
  if (currentRole === "admin" || userContexts.length <= 1) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "inline-flex";
  const ctx = userContexts[activeContextIndex];
  document.getElementById("roleSwitcherCurrent").textContent =
    (ctx && ctx.label) || roleName(currentRole);

  const menu = document.getElementById("roleSwitcherMenu");
  menu.innerHTML = "";
  userContexts.forEach((c, i) => {
    const item = document.createElement("div");
    item.className =
      "role-switcher-item" + (i === activeContextIndex ? " active" : "");
    item.textContent = c.label || roleName(c.role);
    item.addEventListener("click", () => switchContext(i));
    menu.appendChild(item);
  });
}

document.getElementById("roleSwitcherBtn").addEventListener("click", () => {
  const btn = document.getElementById("roleSwitcherBtn");
  const menu = document.getElementById("roleSwitcherMenu");

  /* [수정] .book 컨테이너가 overflow:hidden이라 absolute 드롭다운이 잘리는 문제 -
     메뉴를 body 바로 아래로 옮기고 fixed 좌표로 버튼 위치에 맞춰 붙임 */
  if (menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }

  const opening = menu.style.display !== "block";
  if (opening) {
    const rect = btn.getBoundingClientRect();
    menu.style.top = rect.bottom + 6 + "px";
    menu.style.left = rect.left + "px";
  }
  menu.style.display = opening ? "block" : "none";
});
document.addEventListener("click", (e) => {
  const wrap = document.getElementById("roleSwitcher");
  const menu = document.getElementById("roleSwitcherMenu");
  if (wrap && !wrap.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = "none";
  }
});
window.addEventListener("scroll", () => {
  document.getElementById("roleSwitcherMenu").style.display = "none";
});

async function switchContext(i) {
  document.getElementById("roleSwitcherMenu").style.display = "none";
  if (i === activeContextIndex) return;
  activeContextIndex = i;
  applyActiveContext();
  document.getElementById("roleLabel").textContent = roleName(currentRole);
  renderRoleSwitcher();
  await initRoleView();
}
