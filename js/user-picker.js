/* =========================================================
   유저 선택 모달 (운영자 / 팀장 지정에 공용 사용)
   ========================================================= */
function userLabel(email) {
  const u = usersList.find((x) => x.email === email);
  if (u && u.name) return `${u.name} (${email})`;
  return email;
}

/* 이메일로 가입 유저의 표시용 이름만 필요할 때 (팀장 출석 관리용) */
function userNameOf(email) {
  const u = usersList.find((x) => x.email === email);
  return (u && u.name) || email;
}

async function loadUsers() {
  try {
    if (!currentChurchId) {
      usersList = [];
      return;
    }
    const snap = await db
      .collection("users")
      .where("churchId", "==", currentChurchId)
      .get();
    usersList = snap.docs.map((d) => ({ email: d.id, ...d.data() }));
    usersList = sortByName(usersList, (u) => u.name || u.email);
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
