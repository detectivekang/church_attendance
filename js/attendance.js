async function loadAttendanceForServices() {
  attendance = {};
  const results = await Promise.all(
    services.map((s) => churchCol("attendance").doc(s.id).get()),
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

/* =========================================================
   [신규] 2달(60일) 이상 출석이 없으면 자동으로 장기 결석자로 전환
   - 그룹 진입 시(현재 연도를 보고 있을 때만) 한 번 검사함.
   - 이번에 불러온 연도의 출석 기록만 갖고 판단하므로, "이번 연도 안에서
     출석한 적이 없고" + "그 팀원이 이번 연도에 등록됐거나 이번 연도
     안에서 이미 60일 이상 출석 공백이 확인될 때"만 자동 전환함.
     (연도 경계를 넘는 과거 기록까지는 불러오지 않으므로, 애매한 경우엔
     자동 전환하지 않고 그대로 둠 - 운영자가 수동으로 지정 가능)
   ========================================================= */
const LONG_TERM_ABSENT_MS = 60 * 24 * 60 * 60 * 1000; // 2달(60일)

function lastPresentTimestamp(memberId) {
  let last = null;
  services.forEach((s) => {
    const rec = normalizeRecord((attendance[s.id] || {})[memberId]);
    if (rec.present) {
      const t = new Date(s.date).getTime();
      if (last === null || t > last) last = t;
    }
  });
  return last;
}

async function autoUpdateLongTermAbsentees() {
  if (!canManageMembers() || services.length === 0) return;
  if (selectedYear !== new Date().getFullYear()) return;

  const now = Date.now();
  const toMark = [];
  members.forEach((m) => {
    if (m.isLeader || m.longTermAbsent) return;
    let baseline = lastPresentTimestamp(m.id);
    if (baseline === null && m.createdAt) {
      /* 이번 연도 출석 기록이 전혀 없을 때, 이번 연도에 등록된 팀원이면
         등록일을 기준으로 삼음(작년 이전 출석 기록은 불러오지 않아
         모르기 때문에, 오래전에 등록된 팀원은 섣불리 판단하지 않음) */
      if (new Date(m.createdAt).getFullYear() === selectedYear) {
        baseline = m.createdAt;
      }
    }
    if (baseline !== null && now - baseline >= LONG_TERM_ABSENT_MS) {
      toMark.push(m.id);
    }
  });
  if (toMark.length === 0) return;

  try {
    const batch = db.batch();
    toMark.forEach((id) => {
      batch.update(churchCol("members").doc(id), {
        longTermAbsent: true,
        longTermAbsentSince: todayStr(),
        longTermAbsentAuto: true,
      });
    });
    await batch.commit();
    toMark.forEach((id) => {
      const m = members.find((x) => x.id === id);
      if (m) m.longTermAbsent = true;
    });
  } catch (e) {
    /* 자동 판정은 실패해도 조용히 넘어감 - 다음에 그룹에 들어올 때
       다시 시도됨 */
  }
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
  await churchCol("attendance")
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
/* [신규] 장기 결석자는 출석 체크 화면/일괄 처리에서 제외됨.
   members.js(팀원 관리)에서는 여전히 전체 목록이 보이고 지정/해제 가능함. */
function activeAttendMembers() {
  return members.filter((m) => !m.longTermAbsent);
}

function renderAttendList() {
  const container = document.getElementById("attendList");
  const bulkToolbar = document.getElementById("attendBulkToolbar");
  container.innerHTML = "";
  const editable = canEditAttendance();
  const attendMembers = activeAttendMembers();
  bulkToolbar.style.display =
    editable && attendMembers.length > 0 ? "flex" : "none";
  if (attendMembers.length === 0) {
    container.innerHTML =
      members.length === 0
        ? '<div class="empty">등록된 팀원이 없습니다.</div>'
        : '<div class="empty">출석 관리 대상인 팀원이 없습니다. (전원 장기 결석 처리됨)</div>';
    return;
  }
  const showDonation = !!(currentGroupData && currentGroupData.trackDonation);
  const showBible = !!(currentGroupData && currentGroupData.trackBible);

  attendMembers.forEach((m, idx) => {
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
              장</div>`
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

/* [신규] 팀장 전용 - 현재 선택된 예배의 전체 팀원 출석을 한 번에
   체크/해제. 팀원마다 개별 저장하지 않고 한 번의 쓰기로 처리 */
async function bulkUpdateAttendance(present) {
  const attendMembers = activeAttendMembers();
  if (!canEditAttendance() || attendMembers.length === 0) return;
  const serviceId = currentServiceId;
  const att = attendance[serviceId] || (attendance[serviceId] = {});
  const patch = {};
  attendMembers.forEach((m) => {
    const next = { ...normalizeRecord(att[m.id]), present };
    att[m.id] = next;
    patch[m.id] = next;
  });
  try {
    await churchCol("attendance").doc(serviceId).set(patch, { merge: true });
  } catch (err) {
    /* [신규] 저장이 실패했는데도 아무 알림 없이 조용히 끝나버리던 문제를
       고치기 위해, 실패 시에는 반드시 화면에 이유를 보여줌 */
    alert("출석 저장에 실패했습니다: " + (err && err.message ? err.message : err));
    return;
  }
  renderAttendList();
  renderStats();
}

document
  .getElementById("attendCheckAllBtn")
  .addEventListener("click", async () => {
    const attendMembers = activeAttendMembers();
    if (!canEditAttendance() || attendMembers.length === 0) return;
    /* [수정] 일부 모바일(인앱 브라우저 등)에서 native confirm()이 동작하지
       않아 버튼을 눌러도 반응이 없던 문제 → 자체 확인 모달로 교체 */
    const ok = await confirmDialog(`${attendMembers.length}명 전체를 출석 처리할까요?`);
    if (!ok) return;
    bulkUpdateAttendance(true);
  });

document
  .getElementById("attendUncheckAllBtn")
  .addEventListener("click", async () => {
    const attendMembers = activeAttendMembers();
    if (!canEditAttendance() || attendMembers.length === 0) return;
    const ok = await confirmDialog("전체 팀원의 출석을 해제할까요?");
    if (!ok) return;
    bulkUpdateAttendance(false);
  });
