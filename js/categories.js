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

  /* [신규] 카테고리도 이름 가나다순으로 표시 */
  const sortedCategories = sortByName(categories);

  sortedCategories.forEach((c) => {
    const card = document.createElement("div");
    card.className = "list-card";

    if (editingCategoryId === c.id) {
      card.innerHTML = `
        <div class="inline-edit-form">
          <input type="text" class="edit-category-name" value="${escapeHtml(c.name)}" placeholder="카테고리 이름" />
          <button class="btn small edit-category-save" data-id="${c.id}">저장</button>
          <button class="btn ghost small edit-category-cancel">취소</button>
        </div>
      `;
      list.appendChild(card);
      return;
    }

    card.innerHTML = `
      <div class="list-card-main" data-id="${c.id}">
        <div class="list-card-title">${escapeHtml(c.name)}</div>
        <div class="list-card-sub">운영자: ${c.operatorEmail ? escapeHtml(userLabel(c.operatorEmail)) : "미지정"} · 그룹 ${groupCountMap[c.id] || 0}개</div>
      </div>
      <div class="list-card-actions">
        ${
          canManageCategories()
            ? `<button class="btn ghost small" data-edit="${c.id}">수정</button>
        <button class="btn ghost small" data-assign="${c.id}">운영자 지정</button>
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
  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingCategoryId = btn.dataset.edit;
      renderCategoriesView();
    });
  });
  list.querySelectorAll(".edit-category-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCategoryId = null;
      renderCategoriesView();
    });
  });
  list.querySelectorAll(".edit-category-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const form = btn.closest(".inline-edit-form");
      const name = form.querySelector(".edit-category-name").value.trim();
      if (!name) {
        form.querySelector(".edit-category-name").focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "저장 중...";
      try {
        await db.collection("categories").doc(id).update({ name });
        editingCategoryId = null;
        await loadCategories();
        await renderCategoriesView();
      } catch (err) {
        alert("수정 중 에러가 발생했습니다: " + err.message);
        btn.disabled = false;
        btn.textContent = "저장";
      }
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
    await removeRoleContext(cat.operatorEmail, {
      role: "operator",
      categoryId: catId,
    }).catch(() => {});
  }
  await db
    .collection("categories")
    .doc(catId)
    .update({ operatorEmail: trimmed });
  if (trimmed) {
    await addRoleContext(trimmed, { role: "operator", categoryId: catId });
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
      await removeRoleContext(email, {
        role: "leader",
        groupId: gdoc.id,
      }).catch(() => {});
    }
    await gdoc.ref.delete();
  }
  if (cat && cat.operatorEmail)
    await removeRoleContext(cat.operatorEmail, {
      role: "operator",
      categoryId: catId,
    }).catch(() => {});
  await db.collection("categories").doc(catId).delete();
  await loadCategories();
  await renderCategoriesView();
}
