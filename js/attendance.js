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

/* =========================================================
   출석 체크 화면
   - [신규] 그룹의 "팀장 출석 관리"가 켜져 있으면 members 배열에
   이미 팀장이 가상 항목(leader:이메일)으로 병합되어 있으므로
   별도 분기 없이 동일하게 도장/헌금/성경 입력이 가능함.
   - 목록은 members.js에서 이미 이름 가나다순으로 정렬되어 있음.
   ========================================================= */
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

  members.forEach((m, idx) => {
    const rec = getRecord(currentServiceId, m.id);
    const row = document.createElement("div");
    row.className = "roster-row";
    row.innerHTML = `
      <div>
        <span class="roster-num">${idx + 1}.</span>
        <span class="roster-name">${escapeHtml(m.name)}${m.isLeader ? '<span class="leader-tag">팀장</span>' : ""}</span>
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
