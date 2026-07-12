/* =========================================================
   Firebase 초기화 & 네트워크 통신 방식
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyAwuAjo1_gjvXVU3_pINJPdzqjTlTJDYts",
  authDomain: "churchattendance-398c4.firebaseapp.com",
  projectId: "churchattendance-398c4",
  storageBucket: "churchattendance-398c4.firebasestorage.app",
  messagingSenderId: "867359683786",
  appId: "1:867359683786:web:e3536070246f9944e57033",
  measurementId: "G-N96QSV5EPL",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

const db = firebase.firestore();

db.settings({
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
});

const ADMIN_EMAIL = "kangseabich@naver.com";

/* =========================================================
   전역 상태
   ========================================================= */
let currentUser = null;
let currentRole = null;
let roleScope = {};

let categories = [];
let categoriesCache = {};
let groups = [];
let selectedCategoryId = null;
let currentGroupData = null;
let selectedGroupId = null;

let members = [];
let services = [];
let attendance = {};
let currentServiceId = null;
let selectedYear = new Date().getFullYear();

let usersList = []; // 가입한 전체 유저 {email, name}
let editingMemberId = null;

/* =========================================================
   유틸 함수
   ========================================================= */
function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
function fmtBirthday(d) {
  if (!d) return "";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[0]}. ${parts[1]}. ${parts[2]}.`;
}
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function roleName(r) {
  return (
    {
      admin: "관리자",
      operator: "운영자",
      leader: "팀장",
      none: "승인 대기",
    }[r] || ""
  );
}
function canEditAttendance() {
  return currentRole === "leader";
}
function canManageMembers() {
  return currentRole === "leader";
}
function canManageGroups() {
  return currentRole === "admin" || currentRole === "operator";
}
function canManageCategories() {
  return currentRole === "admin";
}

function userLabel(email) {
  const u = usersList.find((x) => x.email === email);
  if (u && u.name) return `${u.name} (${email})`;
  return email;
}

function generateSundaysForYear(year) {
  const result = [];
  const today = new Date();
  const isCurrentYear = year === today.getFullYear();
  let d = new Date(`${year}-01-01`);
  while (d.getDay() !== 0) {
    d.setDate(d.getDate() + 1);
  }
  let endDate;
  if (isCurrentYear) {
    endDate = new Date();
    endDate.setDate(today.getDate() + ((7 - today.getDay()) % 7));
  } else {
    endDate = new Date(`${year}-12-31`);
  }
  while (d <= endDate) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    result.push({
      id: `${yyyy}${mm}${dd}`,
      date: `${yyyy}-${mm}-${dd}`,
      label: "주일예배",
    });
    d.setDate(d.getDate() + 7);
  }
  return result;
}
function generateSundaysUntilToday() {
  return generateSundaysForYear(new Date().getFullYear());
}
/* 연도 선택 옵션: 올해부터 9년 전까지 */
function getYearOptions() {
  const cur = new Date().getFullYear();
  const years = [];
  for (let y = cur; y >= cur - 9; y--) years.push(y);
  return years;
}

function showMain(name) {
  document
    .querySelectorAll(".mainview")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("main-" + name).classList.add("active");
}

/* =========================================================
   뒤로가기(Back) 버튼 대응
   - 화면 전환마다 history state를 쌓아 두어, 모바일/브라우저의
   뒤로가기가 앱을 이탈해 로그인 화면으로 튕기지 않고
   카테고리 > 그룹 > 그룹상세 단계를 자연스럽게 오가도록 함.
   - bfcache로 인해 예전 화면이 그대로 복원되는 경우를 막기 위해
   pageshow에서 강제로 새로고침.
   ========================================================= */
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
   유저 선택 모달 (운영자 / 팀장 지정에 공용 사용)
   ========================================================= */
async function loadUsers() {
  try {
    const snap = await db.collection("users").get();
    usersList = snap.docs.map((d) => ({ email: d.id, ...d.data() }));
    usersList.sort((a, b) =>
      (a.name || a.email).localeCompare(b.name || b.email),
    );
  } catch (e) {
    usersList = [];
  }
}

function openUserPicker({ title, sub, multi, selected }) {
  return new Promise(async (resolve) => {
    await loadUsers();
    const overlay = document.getElementById("userPickerOverlay");
    const titleEl = document.getElementById("userPickerTitle");
    const subEl = document.getElementById("userPickerSub");
    const listEl = document.getElementById("userPickerList");
    const searchEl = document.getElementById("userPickerSearch");
    const saveBtn = document.getElementById("userPickerSave");
    const cancelBtn = document.getElementById("userPickerCancel");

    titleEl.textContent = title;
    subEl.textContent = sub || "";
    searchEl.value = "";
    let currentSelected = new Set(selected || []);

    function renderList(filter) {
      listEl.innerHTML = "";
      const f = (filter || "").trim().toLowerCase();
      const filtered = usersList.filter((u) => {
        if (!f) return true;
        return (
          (u.name || "").toLowerCase().includes(f) ||
          u.email.toLowerCase().includes(f)
        );
      });
      if (filtered.length === 0) {
        listEl.innerHTML =
          '<div class="modal-none">가입된 사용자가 없습니다.</div>';
        return;
      }
      filtered.forEach((u) => {
        const row = document.createElement("div");
        row.className = "modal-user-row";
        const checked = currentSelected.has(u.email);
        row.innerHTML = `
          <input type="${multi ? "checkbox" : "radio"}" name="userPick" data-email="${u.email}" ${checked ? "checked" : ""} />
          <div>
            <div class="modal-user-name">${escapeHtml(u.name || "(이름 미입력)")}</div>
            <div class="modal-user-email">${escapeHtml(u.email)}</div>
          </div>
        `;
        row.addEventListener("click", (e) => {
          const input = row.querySelector("input");
          if (e.target !== input) {
            if (!multi) input.checked = true;
            else input.checked = !input.checked;
          }
          if (multi) {
            if (input.checked) currentSelected.add(u.email);
            else currentSelected.delete(u.email);
          } else {
            currentSelected = new Set(input.checked ? [u.email] : []);
            renderList(searchEl.value);
          }
        });
        listEl.appendChild(row);
      });
    }
    renderList("");
    searchEl.oninput = () => renderList(searchEl.value);

    overlay.style.display = "flex";

    function cleanup() {
      overlay.style.display = "none";
      saveBtn.onclick = null;
      cancelBtn.onclick = null;
      searchEl.oninput = null;
    }

    saveBtn.onclick = () => {
      cleanup();
      resolve(Array.from(currentSelected));
    };
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
  });
}

/* =========================================================
   인증 처리
   ========================================================= */
document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!email || !pw) {
    errEl.textContent = "이메일과 비밀번호를 입력하세요.";
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch (e) {
    errEl.textContent = translateAuthError(e);
  }
});

document.getElementById("signupBtn").addEventListener("click", async () => {
  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!name) {
    errEl.textContent = "이름을 입력하세요.";
    document.getElementById("signupName").focus();
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
  try {
    await auth.createUserWithEmailAndPassword(email, pw);
    await ensureUserDoc({ email }, name);
  } catch (e) {
    errEl.textContent = translateAuthError(e);
  }
});

document
  .getElementById("logoutBtn")
  .addEventListener("click", () => auth.signOut());

function translateAuthError(e) {
  const map = {
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/user-not-found": "등록되지 않은 이메일입니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해주세요.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  };
  return map[e.code] || "오류: " + e.message;
}

async function ensureUserDoc(user, name) {
  try {
    const ref = db.collection("users").doc(user.email);
    const doc = await ref.get();
    if (!doc.exists) {
      await ref.set({
        email: user.email,
        name: name || "",
        createdAt: Date.now(),
      });
    } else if (name && !doc.data().name) {
      await ref.update({ name });
    }
  } catch (e) {
    /* 유저 정보 저장 실패는 앱 진행에 영향 없도록 무시 */
  }
}

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    document.getElementById("userEmailLabel").textContent = user.email;
    await ensureUserDoc(user);
    await resolveRole(user);
    document.getElementById("roleLabel").textContent = roleName(currentRole);
    await loadChurchName();
    document.getElementById("todayLabel").textContent =
      fmtDate(todayStr()) + " 기준";
    await initRoleView();
  } else {
    currentUser = null;
    currentRole = null;
    roleScope = {};
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appScreen").style.display = "none";
  }
});

async function resolveRole(user) {
  if (user.email === ADMIN_EMAIL) {
    currentRole = "admin";
    roleScope = {};
    return;
  }
  try {
    const doc = await db.collection("roles").doc(user.email).get();
    if (doc.exists) {
      const data = doc.data();
      currentRole = data.role;
      roleScope = data;
    } else {
      currentRole = "none";
      roleScope = {};
    }
  } catch (e) {
    currentRole = "none";
  }
}

async function loadChurchName() {
  try {
    const doc = await db.collection("settings").doc("church").get();
    const name =
      doc.exists && doc.data().name ? doc.data().name : "서산 성결 교회";
    document.getElementById("churchName").value = name;
  } catch (e) {}
  document.getElementById("churchName").disabled = currentRole !== "admin";
}

document.getElementById("churchName").addEventListener("change", async (e) => {
  if (currentRole !== "admin") return;
  await db.collection("settings").doc("church").set({ name: e.target.value });
});

/* =========================================================
   화면 라우팅
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
   카테고리 관리
   ========================================================= */
async function loadCategories() {
  const snap = await db.collection("categories").get();
  categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  categoriesCache = Object.fromEntries(categories.map((c) => [c.id, c]));
}

async function renderCategoriesView() {
  document.querySelector("#main-categories .add-form").style.display =
    canManageCategories() ? "flex" : "none";

  const list = document.getElementById("categoryList");
  list.innerHTML = "";
  if (categories.length === 0) {
    list.innerHTML = '<div class="empty">등록된 카테고리가 없습니다.</div>';
    return;
  }

  const groupSnap = await db.collection("groups").get();
  const groupCountMap = {};
  groupSnap.docs.forEach((d) => {
    const gc = d.data().categoryId;
    groupCountMap[gc] = (groupCountMap[gc] || 0) + 1;
  });

  categories.forEach((c) => {
    const card = document.createElement("div");
    card.className = "list-card";
    card.innerHTML = `
      <div class="list-card-main" data-id="${c.id}">
        <div class="list-card-title">${escapeHtml(c.name)}</div>
        <div class="list-card-sub">운영자: ${c.operatorEmail ? escapeHtml(userLabel(c.operatorEmail)) : "미지정"} · 그룹 ${groupCountMap[c.id] || 0}개</div>
      </div>
      <div class="list-card-actions">
        ${
          canManageCategories()
            ? `<button class="btn ghost small" data-assign="${c.id}">운영자 지정</button>
        <button class="btn danger" data-del="${c.id}">삭제</button>`
            : ""
        }
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll(".list-card-main").forEach((el) => {
    el.addEventListener("click", async () => {
      selectedCategoryId = el.dataset.id;
      await loadGroups(selectedCategoryId);
      renderBreadcrumb();
      await renderGroupsView();
      showMain("groups");
      navigateTo({ level: "groups", categoryId: selectedCategoryId });
    });
  });
  list.querySelectorAll("[data-assign]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      assignOperator(btn.dataset.assign);
    });
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCategory(btn.dataset.del);
    });
  });
}

document
  .getElementById("addCategoryBtn")
  .addEventListener("click", async (e) => {
    if (!canManageCategories()) return;
    const btn = e.target;
    const nameInput = document.getElementById("newCategoryName");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "등록 중...";

    try {
      await db
        .collection("categories")
        .add({ name, operatorEmail: null, createdAt: Date.now() });
      nameInput.value = "";
      await loadCategories();
      await renderCategoriesView();
    } catch (err) {
      alert("등록 중 에러가 발생했습니다: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

async function assignOperator(catId) {
  const cat = categories.find((c) => c.id === catId);
  const result = await openUserPicker({
    title: "운영자 지정",
    sub: "가입된 사용자 중 이 카테고리의 운영자를 선택하세요. (선택 해제 시 지정 해제)",
    multi: false,
    selected: cat.operatorEmail ? [cat.operatorEmail] : [],
  });
  if (result === null) return;
  const trimmed = result[0] || null;
  if (cat.operatorEmail && cat.operatorEmail !== trimmed) {
    await db
      .collection("roles")
      .doc(cat.operatorEmail)
      .delete()
      .catch(() => {});
  }
  await db
    .collection("categories")
    .doc(catId)
    .update({ operatorEmail: trimmed });
  if (trimmed) {
    await db
      .collection("roles")
      .doc(trimmed)
      .set({ role: "operator", categoryId: catId });
  }
  await loadCategories();
  await renderCategoriesView();
}

async function deleteCategory(catId) {
  if (
    !confirm(
      "이 카테고리와 소속된 모든 그룹·팀원 정보가 함께 삭제됩니다. 계속할까요?",
    )
  )
    return;
  const cat = categories.find((c) => c.id === catId);
  const groupSnap = await db
    .collection("groups")
    .where("categoryId", "==", catId)
    .get();
  for (const gdoc of groupSnap.docs) {
    const g = gdoc.data();
    const memberSnap = await db
      .collection("members")
      .where("groupId", "==", gdoc.id)
      .get();
    await Promise.all(memberSnap.docs.map((m) => m.ref.delete()));
    const leaderEmails = normalizeLeaderEmails(g);
    for (const email of leaderEmails) {
      await db
        .collection("roles")
        .doc(email)
        .delete()
        .catch(() => {});
    }
    await gdoc.ref.delete();
  }
  if (cat && cat.operatorEmail)
    await db
      .collection("roles")
      .doc(cat.operatorEmail)
      .delete()
      .catch(() => {});
  await db.collection("categories").doc(catId).delete();
  await loadCategories();
  await renderCategoriesView();
}

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

  renderCategoryOverview();

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

  groups.forEach((g) => {
    const leaderEmails = normalizeLeaderEmails(g);
    const leaderLabel = leaderEmails.length
      ? leaderEmails.map((e) => escapeHtml(userLabel(e))).join(", ")
      : "미지정";
    const card = document.createElement("div");
    card.className = "list-card";
    card.innerHTML = `
      <div class="list-card-main" data-id="${g.id}">
        <div class="list-card-title">${escapeHtml(g.name)}</div>
        <div class="list-card-sub">팀장: ${leaderLabel} · 팀원 ${memberCountMap[g.id] || 0}명</div>
      </div>
      <div class="list-card-actions">
        ${
          canManageGroups()
            ? `<button class="btn ghost small" data-assign="${g.id}">팀장 지정</button>
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
}

/* 카테고리(그룹 목록 단계) 전체 출석 현황 / 생일자 - 팀까지 들어가지 않아도 확인 가능 */
async function renderCategoryOverview() {
  const cardsEl = document.getElementById("categorySummaryCards");
  const bdayEl = document.getElementById("categoryBirthdayList");
  if (!cardsEl || !bdayEl) return;
  if (!selectedCategoryId || groups.length === 0) {
    cardsEl.innerHTML = '<div class="empty">등록된 그룹이 없습니다.</div>';
    bdayEl.innerHTML = "";
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
    groups.forEach((g, i) => {
      memberSnaps[i].docs.forEach((d) => {
        allMembers.push({
          id: d.id,
          ...d.data(),
          groupId: g.id,
          groupName: g.name,
        });
      });
    });

    const overviewYear = new Date().getFullYear();
    const overviewServices = generateSundaysForYear(overviewYear);
    const attSnaps = await Promise.all(
      overviewServices.map((s) => db.collection("attendance").doc(s.id).get()),
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
      bdayEl.innerHTML = '<div class="empty">이번 달 생일자가 없습니다.</div>';
    } else {
      bdayEl.innerHTML = `<div class="birthday-list">${bdayList
        .map(
          (m) =>
            `<div class="birthday-item"><span class="grp">${escapeHtml(m.groupName)}</span> - ${escapeHtml(m.name)}(${escapeHtml(fmtBirthday(m.birthday))})</div>`,
        )
        .join("")}</div>`;
    }
  } catch (e) {
    cardsEl.innerHTML = '<div class="empty">현황을 불러오지 못했습니다.</div>';
  }
}

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
    await db
      .collection("roles")
      .doc(email)
      .delete()
      .catch(() => {});
  }
  for (const email of added) {
    await db
      .collection("roles")
      .doc(email)
      .set({ role: "leader", groupId: groupId });
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
      await db
        .collection("roles")
        .doc(email)
        .delete()
        .catch(() => {});
    }
  }
  await db.collection("groups").doc(groupId).delete();
  await loadGroups(selectedCategoryId);
  await renderGroupsView();
}

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
  const sel = document.getElementById("yearSelect");
  if (!sel) return;
  sel.innerHTML = "";
  getYearOptions().forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y + "년";
    if (y === selectedYear) opt.selected = true;
    sel.appendChild(opt);
  });
}

document.getElementById("yearSelect").addEventListener("change", async (e) => {
  selectedYear = Number(e.target.value);
  services = generateSundaysForYear(selectedYear);
  await loadAttendanceForServices();
  const sorted = [...services].sort((a, b) => b.date.localeCompare(a.date));
  currentServiceId = sorted.length ? sorted[0].id : null;
  renderServiceSelect();
  renderAttendList();
  renderStats();
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

async function loadMembers(groupId) {
  const snap = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();
  members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadAttendanceForServices() {
  attendance = {};
  const results = await Promise.all(
    services.map((s) => db.collection("attendance").doc(s.id).get()),
  );
  services.forEach((s, i) => {
    attendance[s.id] = results[i].exists ? results[i].data() : {};
  });
}

function renderServiceSelect() {
  const sel = document.getElementById("serviceSelect");
  sel.innerHTML = "";
  const sorted = [...services].sort((a, b) => b.date.localeCompare(a.date));
  sorted.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${fmtDate(s.date)} · ${s.label}`;
    if (s.id === currentServiceId) opt.selected = true;
    sel.appendChild(opt);
  });
}

document.getElementById("serviceSelect").addEventListener("change", (e) => {
  currentServiceId = e.target.value;
  renderAttendList();
});

/* =========================================================
   출결 레코드 정규화 (출석 / 헌금 / 성경 통합 구조)
   ========================================================= */
function normalizeRecord(raw) {
  if (raw && typeof raw === "object") {
    return {
      present: !!raw.present,
      donation: typeof raw.donation === "number" ? raw.donation : 0,
      bible: Number(raw.bible) || 0,
    };
  }
  return { present: !!raw, donation: 0, bible: 0 };
}

function getRecord(serviceId, memberId) {
  const raw = (attendance[serviceId] || {})[memberId];
  return normalizeRecord(raw);
}

async function updateRecord(serviceId, memberId, patch) {
  const att = attendance[serviceId] || (attendance[serviceId] = {});
  const cur = normalizeRecord(att[memberId]);
  const next = { ...cur, ...patch };
  att[memberId] = next;
  await db
    .collection("attendance")
    .doc(serviceId)
    .set({ [memberId]: next }, { merge: true });
  return next;
}

function renderAttendList() {
  const container = document.getElementById("attendList");
  container.innerHTML = "";
  if (members.length === 0) {
    container.innerHTML = '<div class="empty">등록된 팀원이 없습니다.</div>';
    return;
  }
  const editable = canEditAttendance();
  const showDonation = !!(currentGroupData && currentGroupData.trackDonation);
  const showBible = !!(currentGroupData && currentGroupData.trackBible);

  members.forEach((m) => {
    const rec = getRecord(currentServiceId, m.id);
    const row = document.createElement("div");
    row.className = "roster-row";
    row.innerHTML = `
      <div>
        <span class="roster-name">${escapeHtml(m.name)}</span>
      </div>
      <div class="roster-extra">
        ${
          showDonation
            ? `<div class="donation-input-wrap">헌금
              <input type="number" min="0" step="1000" class="donation-input" data-id="${m.id}" value="${rec.donation}" ${editable ? "" : "disabled"} />
              원</div>`
            : ""
        }
        ${
          showBible
            ? `<div class="bible-input-wrap">성경
              <input type="number" min="0" max="66" class="bible-input" data-id="${m.id}" value="${rec.bible}" ${editable ? "" : "disabled"} />
              권</div>`
            : ""
        }
        <button class="stamp-btn ${rec.present ? "present" : ""} ${editable ? "" : "readonly"}" data-id="${m.id}">${rec.present ? "출 석" : "출석 체크"}</button>
      </div>
    `;
    container.appendChild(row);
  });

  if (!editable) return;

  container.querySelectorAll(".stamp-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const cur = getRecord(currentServiceId, id);
      const next = await updateRecord(currentServiceId, id, {
        present: !cur.present,
      });
      btn.classList.toggle("present", next.present);
      btn.textContent = next.present ? "출 석" : "출석 체크";
      if (next.present) {
        btn.classList.remove("stamp-pop");
        void btn.offsetWidth;
        btn.classList.add("stamp-pop");
      }
      renderStats();
    });
  });

  container.querySelectorAll(".donation-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      let val = Number(input.value);
      if (isNaN(val) || val < 0) val = 0;
      input.value = val;
      await updateRecord(currentServiceId, id, { donation: val });
      renderStats();
    });
  });

  container.querySelectorAll(".bible-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.dataset.id;
      let val = Number(input.value);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 66) val = 66;
      input.value = val;
      await updateRecord(currentServiceId, id, { bible: val });
      renderStats();
    });
  });
}

/* =========================================================
   팀원 명부 (등록 / 수정 / 삭제)
   ========================================================= */
function renderMembers() {
  const list = document.getElementById("memberList");
  list.innerHTML = "";
  if (members.length === 0) {
    list.innerHTML = '<div class="empty">등록된 팀원이 없습니다.</div>';
    return;
  }
  const editable = canManageMembers();
  members.forEach((m) => {
    const item = document.createElement("div");
    item.className = "member-item";

    if (editingMemberId === m.id) {
      item.innerHTML = `
        <div class="member-edit-form">
          <input type="text" class="edit-name" value="${escapeHtml(m.name)}" placeholder="이름" />
          <input type="date" class="edit-birthday" value="${m.birthday || ""}" />
          <button class="btn small edit-save" data-id="${m.id}">저장</button>
          <button class="btn ghost small edit-cancel">취소</button>
        </div>
      `;
      list.appendChild(item);
      return;
    }

    item.innerHTML = `
      <div class="member-item-left">
        <div class="roster-name-block">
          <span class="roster-name">${escapeHtml(m.name)}</span>
          ${m.birthday ? `<span class="roster-birthday">🎂 ${escapeHtml(fmtBirthday(m.birthday))}</span>` : ""}
        </div>
      </div>
      ${
        editable
          ? `<div class="member-item-actions">
              <button class="btn ghost small" data-edit="${m.id}">수정</button>
              <button class="btn danger" data-id="${m.id}">삭제</button>
            </div>`
          : ""
      }
    `;
    list.appendChild(item);
  });

  if (!editable) return;

  list.querySelectorAll("button.danger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!confirm("이 팀원을 삭제할까요? 출석 기록도 함께 사라집니다."))
        return;
      await db.collection("members").doc(id).delete();
      await loadMembers(selectedGroupId);
      renderMembers();
      renderAttendList();
      renderStats();
    });
  });

  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingMemberId = btn.dataset.edit;
      renderMembers();
    });
  });

  list.querySelectorAll(".edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingMemberId = null;
      renderMembers();
    });
  });

  list.querySelectorAll(".edit-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const form = btn.closest(".member-edit-form");
      const name = form.querySelector(".edit-name").value.trim();
      const birthday = form.querySelector(".edit-birthday").value || null;
      if (!name) {
        form.querySelector(".edit-name").focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "저장 중...";
      try {
        await db.collection("members").doc(id).update({ name, birthday });
        editingMemberId = null;
        await loadMembers(selectedGroupId);
        renderMembers();
        renderAttendList();
        renderStats();
      } catch (err) {
        alert("수정 중 에러가 발생했습니다: " + err.message);
        btn.disabled = false;
        btn.textContent = "저장";
      }
    });
  });
}

document.getElementById("addMemberBtn").addEventListener("click", async (e) => {
  if (!canManageMembers()) return;
  const btn = e.target;
  const nameInput = document.getElementById("newMemberName");
  const birthdayInput = document.getElementById("newMemberBirthday");
  const name = nameInput.value.trim();
  const birthday = birthdayInput.value || null;
  if (!name) {
    nameInput.focus();
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "등록 중...";

  try {
    await db.collection("members").add({
      name,
      birthday,
      groupId: selectedGroupId,
      createdAt: Date.now(),
    });
    nameInput.value = "";
    birthdayInput.value = "";
    await loadMembers(selectedGroupId);
    renderMembers();
    renderAttendList();
    renderStats();
  } catch (err) {
    alert("등록 중 에러가 발생했습니다: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

/* =========================================================
   통계
   ========================================================= */
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
    extraCards += `<div class="summary-card"><div class="num">${bibleAvg}</div><div class="lbl">1인 평균 성경 진도(권)</div></div>`;
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
    .sort((a, b) => b.pct - a.pct);

  memberStats.forEach(({ m, pct, donation, bibleMax }) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    let extra = "";
    if (showDonation || showBible) {
      extra = `<div class="stat-extra">
        ${showDonation ? `<span>헌금 <b>${donation.toLocaleString()}</b>원</span>` : ""}
        ${showBible ? `<span>성경 <b>${bibleMax}</b>권</span>` : ""}
      </div>`;
    }
    row.innerHTML = `
      <div class="stat-name">${escapeHtml(m.name)}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
      <div class="stat-pct">${pct}%</div>
      ${extra}
    `;
    statList.appendChild(row);
  });
  renderYearlyStats();
}

/* =========================================================
   이번 달 생일자
   ========================================================= */
function isBirthdayInCurrentMonth(birthday) {
  if (!birthday) return false;
  const parts = birthday.split("-");
  if (parts.length !== 3) return false;
  return Number(parts[1]) === new Date().getMonth() + 1;
}
function birthdayDay(birthday) {
  const parts = (birthday || "").split("-");
  return parts.length === 3 ? Number(parts[2]) : 99;
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

/* =========================================================
   엑셀 업로드 / 다운로드
   ========================================================= */

/* 팀원 명부 엑셀 다운로드 */
document
  .getElementById("downloadMembersExcelBtn")
  .addEventListener("click", () => {
    if (!currentGroupData) return;
    const rows = [["이름", "생일"]];
    members.forEach((m) => rows.push([m.name, m.birthday || ""]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "팀원명부");
    XLSX.writeFile(wb, `${currentGroupData.name}_팀원명부.xlsx`);
  });

/* 양식 파일 다운로드 */
document
  .getElementById("excelTemplateDownloadLink")
  .addEventListener("click", (e) => {
    e.preventDefault();
    const rows = [
      ["이름", "생일"],
      ["홍길동", "1990-01-15"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "양식");
    XLSX.writeFile(wb, "팀원등록_양식.xlsx");
  });

let excelParsedRows = [];

function resetExcelUploadModal() {
  excelParsedRows = [];
  document.getElementById("excelUploadInput").value = "";
  document.getElementById("excelUploadPreviewWrap").style.display = "none";
  document.getElementById("excelUploadPreview").innerHTML = "";
  document.getElementById("excelUploadCount").textContent = "0";
  document.getElementById("excelUploadSave").disabled = true;
}

document
  .getElementById("openMemberExcelUploadBtn")
  .addEventListener("click", () => {
    if (!canManageMembers()) return;
    resetExcelUploadModal();
    document.getElementById("excelUploadOverlay").style.display = "flex";
  });

document.getElementById("excelUploadCancel").addEventListener("click", () => {
  document.getElementById("excelUploadOverlay").style.display = "none";
  resetExcelUploadModal();
});

function normalizeBirthdayCell(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, "0");
    const dd = String(val.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return "";
}

document.getElementById("excelUploadInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      excelParsedRows = rows
        .map((r) => {
          const name = String(r["이름"] ?? r["name"] ?? r["Name"] ?? "").trim();
          const birthdayRaw = r["생일"] ?? r["birthday"] ?? r["Birthday"] ?? "";
          const birthday = normalizeBirthdayCell(birthdayRaw);
          return { name, birthday };
        })
        .filter((r) => r.name);

      const previewEl = document.getElementById("excelUploadPreview");
      if (excelParsedRows.length === 0) {
        previewEl.innerHTML =
          '<div class="modal-none">인식된 데이터가 없습니다. "이름" 열이 있는지 확인해주세요.</div>';
      } else {
        previewEl.innerHTML = excelParsedRows
          .map(
            (r) =>
              `<div class="excel-preview-row"><span>${escapeHtml(r.name)}</span><span>${escapeHtml(r.birthday || "-")}</span></div>`,
          )
          .join("");
      }
      document.getElementById("excelUploadCount").textContent =
        excelParsedRows.length;
      document.getElementById("excelUploadPreviewWrap").style.display = "block";
      document.getElementById("excelUploadSave").disabled =
        excelParsedRows.length === 0;
    } catch (err) {
      alert("엑셀 파일을 읽는 중 오류가 발생했습니다: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
});

document
  .getElementById("excelUploadSave")
  .addEventListener("click", async () => {
    if (!canManageMembers() || excelParsedRows.length === 0) return;
    const btn = document.getElementById("excelUploadSave");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "등록 중...";
    try {
      const batch = db.batch();
      excelParsedRows.forEach((r) => {
        const ref = db.collection("members").doc();
        batch.set(ref, {
          name: r.name,
          birthday: r.birthday || null,
          groupId: selectedGroupId,
          createdAt: Date.now(),
        });
      });
      await batch.commit();
      document.getElementById("excelUploadOverlay").style.display = "none";
      resetExcelUploadModal();
      await loadMembers(selectedGroupId);
      renderMembers();
      renderAttendList();
      renderStats();
      alert("팀원이 일괄 등록되었습니다.");
    } catch (err) {
      alert("등록 중 에러가 발생했습니다: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

/* 통계 - 출석부 엑셀 다운로드 (팀원 x 예배일 매트릭스) */
document
  .getElementById("downloadStatsExcelBtn")
  .addEventListener("click", () => {
    if (!currentGroupData) return;
    const sorted = [...services].sort((a, b) => a.date.localeCompare(b.date));
    const showDonation = !!currentGroupData.trackDonation;
    const showBible = !!currentGroupData.trackBible;

    const attHeader = ["이름", ...sorted.map((s) => s.date)];
    const attRows = [attHeader];
    members.forEach((m) => {
      const row = [m.name];
      sorted.forEach((s) => {
        const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
        row.push(rec.present ? "O" : "");
      });
      attRows.push(row);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attRows), "출석");

    if (showDonation) {
      const donRows = [attHeader];
      members.forEach((m) => {
        const row = [m.name];
        sorted.forEach((s) => {
          const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
          row.push(rec.donation || "");
        });
        donRows.push(row);
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(donRows),
        "헌금",
      );
    }

    if (showBible) {
      const bibleRows = [attHeader];
      members.forEach((m) => {
        const row = [m.name];
        sorted.forEach((s) => {
          const rec = normalizeRecord((attendance[s.id] || {})[m.id]);
          row.push(rec.bible || "");
        });
        bibleRows.push(row);
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(bibleRows),
        "성경",
      );
    }

    XLSX.writeFile(wb, `${currentGroupData.name}_출석부_${selectedYear}.xlsx`);
  });

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
