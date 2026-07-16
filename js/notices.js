/* =========================================================
   [신규] 공지사항 (관리자 작성 + 로그인 팝업)
   - notices/{autoId}: { content, popup(bool), createdAt, createdBy }
   - 팝업 노출 대상은 popup:true인 공지 중, 이 브라우저에서
   "오늘 하루 안 보기"로 닫지 않은 것들만. 여러 개면 순서대로 하나씩 노출.
   - "오늘 하루 안 보기" 여부는 서버가 아니라 이 브라우저(localStorage)에만
   저장되므로, 다른 기기로 로그인하면 다시 보임(의도된 동작).
   ========================================================= */

const NOTICE_DISMISS_KEY = "noticeDismiss_v1";

function loadNoticeDismissMap() {
  try {
    return JSON.parse(localStorage.getItem(NOTICE_DISMISS_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveNoticeDismiss(noticeId) {
  const map = loadNoticeDismissMap();
  map[noticeId] = todayStr();
  try {
    localStorage.setItem(NOTICE_DISMISS_KEY, JSON.stringify(map));
  } catch (e) {}
}

/* =========================================================
   로그인 직후 팝업 노출
   ========================================================= */
async function checkNoticePopups() {
  if (!currentChurchId) return;
  let snap;
  try {
    /* [수정] where+orderBy 조합은 Firestore 복합 색인이 없으면 조회 자체가
       실패하는데, 그 에러를 조용히 무시하고 있어서 팝업이 안 뜨는데도
       원인을 알 수 없었음. 정렬은 클라이언트에서 하도록 바꿔 색인 없이도
       동작하게 하고, 실패 시에는 콘솔에 에러를 남김.
       [수정] 교회별로 격리 (churchId + popup 복합 색인 필요 - firestore.indexes.json 참고) */
    snap = await db
      .collection("notices")
      .where("churchId", "==", currentChurchId)
      .where("popup", "==", true)
      .get();
  } catch (e) {
    console.error("공지사항 팝업 조회 실패:", e);
    return;
  }
  const dismissMap = loadNoticeDismissMap();
  const today = todayStr();
  const queue = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => dismissMap[n.id] !== today)
    .sort((a, b) => b.createdAt - a.createdAt);

  showNoticeQueue(queue);
}

function showNoticeQueue(queue) {
  if (queue.length === 0) return;
  const [current, ...rest] = queue;

  const overlay = document.getElementById("noticePopupOverlay");
  const contentEl = document.getElementById("noticePopupContent");
  const hideTodayEl = document.getElementById("noticePopupHideToday");
  const closeBtn = document.getElementById("noticePopupCloseBtn");

  contentEl.textContent = current.content || "";
  hideTodayEl.checked = false;
  overlay.style.display = "flex";

  closeBtn.onclick = () => {
    if (hideTodayEl.checked) saveNoticeDismiss(current.id);
    overlay.style.display = "none";
    showNoticeQueue(rest);
  };
}

/* =========================================================
   관리자: 공지사항 작성/목록/삭제/팝업 토글
   ========================================================= */
async function loadNotices() {
  const snap = await db
    .collection("notices")
    .where("churchId", "==", currentChurchId)
    .orderBy("createdAt", "desc")
    .get();
  notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* [신규] 팝업은 항상 1개만 켜지도록, 켜진 것들을 전부 끔 (현재 교회 범위 내) */
async function turnOffAllPopups() {
  const snap = await db
    .collection("notices")
    .where("churchId", "==", currentChurchId)
    .where("popup", "==", true)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { popup: false }));
  await batch.commit();
}

function renderNoticeAdminList() {
  const list = document.getElementById("noticeAdminList");
  list.innerHTML = "";
  if (notices.length === 0) {
    list.innerHTML = '<div class="empty">등록된 공지사항이 없습니다.</div>';
    return;
  }
  notices.forEach((n) => {
    const card = document.createElement("div");
    card.className = "list-card notice-card";
    card.innerHTML = `
      <div class="list-card-main">
        <div class="list-card-title notice-card-content">${escapeHtml(n.content || "")}</div>
        <div class="list-card-sub">${n.popup ? "팝업 노출 중" : "팝업 꺼짐"} · ${fmtDate(new Date(n.createdAt).toISOString().slice(0, 10))}</div>
      </div>
      <div class="list-card-actions">
        <button class="btn ghost small" data-toggle="${n.id}">${n.popup ? "팝업 끄기" : "팝업 켜기"}</button>
        <button class="btn danger" data-del="${n.id}">삭제</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggle;
      const n = notices.find((x) => x.id === id);
      /* [수정] 이 공지의 팝업을 켜는 경우, 다른 공지들의 팝업은 자동으로 꺼서
         항상 팝업이 최대 1개만 켜져 있도록 함 */
      if (!n.popup) {
        await turnOffAllPopups();
      }
      await db
        .collection("notices")
        .doc(id)
        .update({ popup: !n.popup });
      await loadNotices();
      renderNoticeAdminList();
    });
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 공지사항을 삭제할까요?")) return;
      await db.collection("notices").doc(btn.dataset.del).delete();
      await loadNotices();
      renderNoticeAdminList();
    });
  });
}

document
  .getElementById("openNoticeAdminBtn")
  .addEventListener("click", async () => {
    if (currentRole !== "admin") return;
    document.getElementById("newNoticeContent").value = "";
    document.getElementById("newNoticePopup").checked = true;
    await loadNotices();
    renderNoticeAdminList();
    document.getElementById("noticeAdminOverlay").style.display = "flex";
  });

document.getElementById("noticeAdminClose").addEventListener("click", () => {
  document.getElementById("noticeAdminOverlay").style.display = "none";
});

document.getElementById("addNoticeBtn").addEventListener("click", async () => {
  if (currentRole !== "admin") return;
  const btn = document.getElementById("addNoticeBtn");
  const contentInput = document.getElementById("newNoticeContent");
  const popupInput = document.getElementById("newNoticePopup");
  const content = contentInput.value.trim();
  if (!content) {
    contentInput.focus();
    return;
  }
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "등록 중...";
  try {
    /* [수정] 새 공지를 팝업으로 켜서 등록하면, 기존에 켜져있던 다른
       공지들의 팝업은 자동으로 꺼서 항상 팝업이 1개만 뜨도록 함 */
    if (popupInput.checked) {
      await turnOffAllPopups();
    }
    await db.collection("notices").add({
      content,
      popup: popupInput.checked,
      churchId: currentChurchId,
      createdAt: Date.now(),
      createdBy: currentUser.email,
    });
    contentInput.value = "";
    popupInput.checked = true;
    await loadNotices();
    renderNoticeAdminList();
  } catch (err) {
    alert("등록 중 에러가 발생했습니다: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
