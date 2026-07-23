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
/* [수정] 권한 체계 개편: 관리자(플랫폼 최고관리자, 교회에 속하지 않음)
   -> 운영자(옛 admin, 교회 최상위) -> 그룹장(옛 operator, 카테고리 담당)
   -> 팀장(leader, 그룹 담당). 내부 role 값("admin"/"operator"/"leader")은
   기존 코드 전반(권한 체크, roles 문서 등)과의 호환을 위해 그대로 두고,
   화면에 보이는 이름표만 바꿈. */
function roleName(r) {
  return (
    {
      superadmin: "관리자",
      admin: "운영자",
      operator: "그룹장",
      leader: "팀장",
      none: "권한 없음",
      //church_pending: "교회 승인 대기",
    }[r] || ""
  );
}
function canEditAttendance() {
  return currentRole === "leader";
}
function canManageMembers() {
  return currentRole === "leader";
}
/* [신규] 기도제목 작성/수정/삭제는 해당 팀의 팀장만. 그룹장(operator)·
   운영자(admin)는 팀원명부와 동일하게 조회만 가능(직접 관리는 팀장 몫) */
function canManagePrayers() {
  return currentRole === "leader";
}
function canManageGroups() {
  return currentRole === "admin" || currentRole === "operator";
}
function canManageCategories() {
  return currentRole === "admin";
}

/* [신규] 한 사람이 여러 그룹(팀)에 동시에 소속될 수 있어서, 그룹별 팀원
   레코드를 단순히 다 더하면 실제 인원수보다 부풀려짐 (예: A가 1그룹과
   2그룹에 모두 속해 있으면 팀원 "2명"으로 잡힘). 이름+생일을 사람을
   구분하는 키로 써서 중복을 제거한 "실제 인원수"를 구함.
   주의: 생일을 등록 안 했고 이름도 같은 두 사람은(예: 동명이인) 한
   사람으로 합쳐질 수 있음 - 정확한 식별자가 아니라 근사치임. */
function memberIdentityKey(m) {
  return `${(m.name || "").trim()}|${m.birthday || ""}`;
}
function countUniqueMembers(list) {
  return new Set(list.map(memberIdentityKey)).size;
}

/* [신규] 이름 가나다순 정렬 공용 헬퍼. 모든 목록(카테고리/그룹/팀원/유저)에서
   동일한 규칙(ko locale)으로 정렬해 화면마다 순서가 다르지 않도록 함. */
function sortByName(arr, nameFn) {
  const getName = nameFn || ((x) => (x && x.name) || "");
  return [...arr].sort((a, b) =>
    getName(a).localeCompare(getName(b), "ko"),
  );
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
    // [수정] 아직 지나지 않은 다음 주일이 미리 보이지 않도록,
    // 오늘을 넘지 않는 가장 최근 주일(오늘이 주일이면 오늘)까지만 생성
    endDate = new Date();
    endDate.setDate(today.getDate() - today.getDay());
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

/* =========================================================
   엑셀 팀원 업로드 시 이름+생일을 키로 기존 팀원과 매칭(merge)하기 위한 헬퍼
   ========================================================= */
function memberMergeKey(name, birthday) {
  return `${(name || "").trim()}||${birthday || ""}`;
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

/* =========================================================
   [신규] 자체 확인 모달 (native confirm() 대체)
   - 일부 모바일 브라우저/인앱 브라우저(카카오톡·네이버 등 웹뷰)는
     window.confirm()을 아예 지원하지 않거나 항상 취소로 처리해버려서,
     "버튼을 눌러도 반응이 없는" 것처럼 보이는 문제가 있었음.
   - 기존 confirm()과 동일하게 await confirmDialog(...)로 쓰면 되고,
     true/false를 반환함(취소·바깥영역 클릭·ESC는 false).
   ========================================================= */
function confirmDialog(message, okText, cancelText) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:320px;">
        <div class="modal-sub" style="white-space:pre-line;font-size:13.5px;color:var(--ink);margin-bottom:16px;">${escapeHtml(message)}</div>
        <div class="modal-actions">
          <button type="button" class="btn ghost small" data-act="cancel">${escapeHtml(cancelText || "취소")}</button>
          <button type="button" class="btn small" data-act="ok">${escapeHtml(okText || "확인")}</button>
        </div>
      </div>
    `;
    function close(result) {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(result);
    }
    function onKeydown(e) {
      if (e.key === "Escape") close(false);
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => close(false));
    overlay.querySelector('[data-act="ok"]').addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
  });
}

/* =========================================================
   엑셀 셀의 날짜값을 YYYY-MM-DD 문자열로 정규화
   (생일 업로드, 출석부 업로드 헤더 날짜 파싱에 공용 사용)
   ========================================================= */
function normalizeDateCell(val) {
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
