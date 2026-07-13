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
