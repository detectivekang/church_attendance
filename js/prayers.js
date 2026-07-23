/* =========================================================
   [신규] 팀원별 기도제목 관리
   - prayers/{autoId}: { memberId, groupId, content, important(bool),
     createdAt, authorEmail, authorName }
   - 작성/수정/삭제는 팀장(leader)만 가능. 그룹장(operator)·운영자(admin)는
     팀원명부와 동일하게 이 그룹에 들어와 조회만 가능 (팀원 프라이버시상
     기도제목은 팀장이 직접 관리하고, 위 직급은 "중요 표시"된 것 위주로
     확인하는 용도)
   - 팀원 카드를 펼치면 그 팀원의 기도제목이 최신순으로 나열되고, 그중
     "중요" 표시된 것은 맨 위로 고정되어 한눈에 띄도록 함
   ========================================================= */

async function loadPrayers(groupId) {
  const snap = await churchCol("prayers").where("groupId", "==", groupId).get();
  prayers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* 특정 팀원의 기도제목을, 중요 표시된 것을 맨 위로 고정한 뒤
   최신 작성순으로 정렬해 반환 */
function prayersForMember(memberId) {
  return prayers
    .filter((p) => p.memberId === memberId)
    .sort((a, b) => {
      if (!!a.important !== !!b.important) return a.important ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

function fmtPrayerDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderPrayerView() {
  const list = document.getElementById("prayerMemberList");
  list.innerHTML = "";

  /* 팀장 가상 항목(isLeader)은 실제 팀원이 아니므로 기도제목 대상에서 제외 */
  const realMembers = members.filter((m) => !m.isLeader);

  if (realMembers.length === 0) {
    list.innerHTML = '<div class="empty">등록된 팀원이 없습니다.</div>';
    return;
  }

  const manageable = canManagePrayers();

  realMembers.forEach((m) => {
    const memberPrayers = prayersForMember(m.id);
    const importantCount = memberPrayers.filter((p) => p.important).length;
    const expanded = expandedPrayerMemberIds.has(m.id);

    const block = document.createElement("div");
    block.className = "prayer-member-block";

    block.innerHTML = `
      <div class="prayer-member-head" data-toggle="${m.id}">
        <div class="prayer-member-head-left">
          <span class="prayer-member-name">${escapeHtml(m.name)}</span>
          ${
            memberPrayers.length
              ? `<span class="prayer-count-badge">${memberPrayers.length}건</span>`
              : ""
          }
          ${
            importantCount
              ? `<span class="prayer-important-badge">⭐ 중요 ${importantCount}</span>`
              : ""
          }
        </div>
        <span class="prayer-toggle-arrow">${expanded ? "▲" : "▼"}</span>
      </div>
      <div class="prayer-member-body" style="display: ${expanded ? "block" : "none"}">
        <div class="prayer-list" id="prayerList-${m.id}"></div>
        ${
          manageable
            ? `<div class="prayer-add-form">
                <textarea class="prayer-add-input" data-member="${m.id}" placeholder="${escapeHtml(m.name)} 님의 기도제목을 적어주세요."></textarea>
                <div class="prayer-add-form-row">
                  <label class="prayer-important-check">
                    <input type="checkbox" class="prayer-add-important" data-member="${m.id}" />
                    ⭐ 중요 표시 (그룹장·운영자에게도 눈에 띄게 표시됩니다)
                  </label>
                  <button class="btn small prayer-add-btn" data-member="${m.id}">기도제목 등록</button>
                </div>
              </div>`
            : ""
        }
      </div>
    `;
    list.appendChild(block);

    if (expanded) {
      renderPrayerListForMember(m.id, memberPrayers, manageable);
    }
  });

  list.querySelectorAll("[data-toggle]").forEach((head) => {
    head.addEventListener("click", () => {
      const id = head.dataset.toggle;
      if (expandedPrayerMemberIds.has(id)) {
        expandedPrayerMemberIds.delete(id);
      } else {
        expandedPrayerMemberIds.add(id);
      }
      renderPrayerView();
    });
  });

  if (!manageable) return;

  list.querySelectorAll(".prayer-add-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const memberId = btn.dataset.member;
      const textarea = list.querySelector(
        `.prayer-add-input[data-member="${memberId}"]`,
      );
      const importantEl = list.querySelector(
        `.prayer-add-important[data-member="${memberId}"]`,
      );
      const content = textarea.value.trim();
      if (!content) {
        textarea.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "등록 중...";
      try {
        await churchCol("prayers").add({
          memberId,
          groupId: selectedGroupId,
          content,
          important: importantEl.checked,
          createdAt: Date.now(),
          authorEmail: currentUser.email,
          authorName: (usersList.find((u) => u.email === currentUser.email) || {}).name || currentUser.email,
        });
        expandedPrayerMemberIds.add(memberId);
        await loadPrayers(selectedGroupId);
        renderPrayerView();
      } catch (err) {
        alert("등록 중 에러가 발생했습니다: " + err.message);
        btn.disabled = false;
        btn.textContent = "기도제목 등록";
      }
    });
  });
}

function renderPrayerListForMember(memberId, memberPrayers, manageable) {
  const box = document.getElementById(`prayerList-${memberId}`);
  if (!box) return;

  if (memberPrayers.length === 0) {
    box.innerHTML = '<div class="empty">등록된 기도제목이 없습니다.</div>';
    return;
  }

  box.innerHTML = memberPrayers
    .map(
      (p) => `
      <div class="prayer-card${p.important ? " important" : ""}" data-id="${p.id}">
        ${p.important ? '<span class="prayer-badge-important">⭐ 중요</span>' : ""}
        <div class="prayer-card-content">${escapeHtml(p.content || "").replace(/\n/g, "<br>")}</div>
        <div class="prayer-card-meta">${escapeHtml(p.authorName || p.authorEmail || "")} · ${fmtPrayerDate(p.createdAt)}</div>
        ${
          manageable
            ? `<div class="prayer-card-actions">
                <button class="btn ghost small" data-toggle-important="${p.id}">${p.important ? "중요 해제" : "중요 표시"}</button>
                <button class="btn danger small" data-del-prayer="${p.id}">삭제</button>
              </div>`
            : ""
        }
      </div>
    `,
    )
    .join("");

  if (!manageable) return;

  box.querySelectorAll("[data-toggle-important]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggleImportant;
      const p = prayers.find((x) => x.id === id);
      if (!p) return;
      btn.disabled = true;
      try {
        await churchCol("prayers").doc(id).update({ important: !p.important });
        p.important = !p.important;
        renderPrayerView();
      } catch (err) {
        alert("변경 중 에러가 발생했습니다: " + err.message);
        btn.disabled = false;
      }
    });
  });

  box.querySelectorAll("[data-del-prayer]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 기도제목을 삭제할까요?")) return;
      const id = btn.dataset.delPrayer;
      try {
        await churchCol("prayers").doc(id).delete();
        prayers = prayers.filter((p) => p.id !== id);
        renderPrayerView();
      } catch (err) {
        alert("삭제 중 에러가 발생했습니다: " + err.message);
      }
    });
  });
}
