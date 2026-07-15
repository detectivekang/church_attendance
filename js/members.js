/* =========================================================
   팀원 로딩 ([신규] 그룹의 "팀장 출석 관리"가 켜져 있으면
   실제 팀원 뒤에 팀장을 가상 항목으로 합쳐서 출석체크/통계에
   함께 포함시킴 - members 컬렉션에는 저장하지 않음)
   ========================================================= */
async function loadMembers(groupId) {
  const snap = await db
    .collection("members")
    .where("groupId", "==", groupId)
    .get();
  let list = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    isLeader: false,
  }));

  if (currentGroupData && currentGroupData.includeLeaderAttendance) {
    const leaderEmails = normalizeLeaderEmails(currentGroupData);
    if (leaderEmails.length) {
      const leaderDocs = await Promise.all(
        leaderEmails.map((email) => db.collection("users").doc(email).get()),
      );
      leaderEmails.forEach((email, i) => {
        const doc = leaderDocs[i];
        const name = (doc.exists && doc.data().name) || email;
        list.push({
          id: `leader:${email}`,
          name,
          birthday: null,
          email,
          isLeader: true,
        });
      });
    }
  }

  /* [신규] 팀원(+팀장) 이름 가나다순 정렬 - 출석체크/명부/엑셀 전부 동일 순서 사용 */
  members = sortByName(list);
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
  members.forEach((m, idx) => {
    const item = document.createElement("div");
    item.className = "member-item";

    if (editingMemberId === m.id && !m.isLeader) {
      item.innerHTML = `
        <div class="member-edit-form">
          <span class="roster-num">${idx + 1}.</span>
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
          <div class="roster-name-line">
            <span class="roster-num">${idx + 1}.</span>
            <span class="roster-name">${escapeHtml(m.name)}${m.isLeader ? '<span class="leader-tag">팀장</span>' : ""}</span>
          </div>
          ${m.birthday ? `<span class="roster-birthday">🎂 ${escapeHtml(fmtBirthday(m.birthday))}</span>` : ""}
        </div>
      </div>
      ${
        editable && !m.isLeader
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
      churchId: currentChurchId,
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
