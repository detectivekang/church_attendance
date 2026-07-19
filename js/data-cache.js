/* =========================================================
   [신규] 공용 데이터 캐시 (Firestore 읽기 사용량 절감)
   - 연도별 출석 데이터 캐시 + 교회 전체 팀원 목록 캐시

   기존에는 "대시보드", "카테고리 전체 현황", "그룹 출석부"가 각자
   따로 "올해 52주치 출석 문서"를 Firestore에서 읽어왔음. 화면을
   이동할 때마다(카테고리 진입 → 그룹 진입 → 대시보드 등) 완전히
   같은 문서 52개를 매번 다시 읽어서 조회량이 실제 필요한 양보다
   몇 배나 많이 나가고 있었음.

   이 파일은 연도별로 한 번만 읽고, 같은 세션 안에서는 재사용하는
   캐시 레이어를 제공한다. 출석 체크로 값이 바뀌면 다시 읽지 않고
   캐시를 그 자리에서 함께 갱신해 항상 최신 상태를 유지한다.

   또한 sessionStorage에도 함께 보관해서, 개발/테스트 중 페이지를
   새로고침해도(브라우저 탭을 닫기 전까지는) 다시 Firestore를 읽지
   않도록 한다 - "혼자 테스트만 하는데도 조회수가 금방 만 건"이 되는
   원인의 상당 부분이 실제로는 새로고침 반복이었음.
   ========================================================= */
const _yearAttendanceCache = {}; // { [year]: { [serviceId]: data } }
const YEAR_ATTENDANCE_TTL_MS = 5 * 60 * 1000; // 5분 - 그 이후엔 최신 상태 확인차 다시 읽음

function _yearAttendanceSessionKey(year) {
  return `attYear:${currentChurchId || "?"}:${year}`;
}

/* 지금 메모리에 있는 캐시를 sessionStorage에도 그대로 반영.
   출석 체크(개별/전체) 직후 attendance.js에서 호출해서, 새로고침
   해도 방금 체크한 내용이 사라지지 않도록 함 */
function persistYearAttendanceCache(year) {
  if (!_yearAttendanceCache[year]) return;
  try {
    sessionStorage.setItem(
      _yearAttendanceSessionKey(year),
      JSON.stringify({ ts: Date.now(), data: _yearAttendanceCache[year] }),
    );
  } catch (e) {
    /* 시크릿 모드 등 sessionStorage를 못 쓰는 환경이면 그냥 메모리 캐시만 사용 */
  }
}

/* 해당 연도의 52주치 출석 데이터를 반환. 이미 이번 세션(메모리 또는
   새로고침 전 sessionStorage)에서 읽은 적이 있으면 Firestore를
   다시 조회하지 않고 캐시를 그대로 반환 */
async function getYearAttendance(year, opts = {}) {
  if (!opts.force && _yearAttendanceCache[year]) {
    return _yearAttendanceCache[year];
  }
  if (!opts.force) {
    try {
      const raw = sessionStorage.getItem(_yearAttendanceSessionKey(year));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < YEAR_ATTENDANCE_TTL_MS) {
          _yearAttendanceCache[year] = parsed.data;
          return parsed.data;
        }
      }
    } catch (e) {}
  }
  const svcList = generateSundaysForYear(year);
  const snaps = await Promise.all(
    svcList.map((s) => churchCol("attendance").doc(s.id).get()),
  );
  const map = {};
  svcList.forEach((s, i) => {
    map[s.id] = snaps[i].exists ? snaps[i].data() : {};
  });
  _yearAttendanceCache[year] = map;
  persistYearAttendanceCache(year);
  return map;
}

/* 엑셀 일괄 업로드처럼 여러 연도에 걸쳐 대량으로 바뀔 수 있는
   경우를 위한 무효화(다음에 필요할 때 다시 읽도록 함) */
function invalidateYearAttendanceCache(year) {
  if (year === undefined) {
    Object.keys(_yearAttendanceCache).forEach((y) => {
      try {
        sessionStorage.removeItem(_yearAttendanceSessionKey(y));
      } catch (e) {}
      delete _yearAttendanceCache[y];
    });
  } else {
    try {
      sessionStorage.removeItem(_yearAttendanceSessionKey(year));
    } catch (e) {}
    delete _yearAttendanceCache[year];
  }
}

/* =========================================================
   [신규] 교회 전체 팀원 목록 공용 캐시

   "대시보드"와 "카테고리 전체 현황" 화면은 팀원을 수정하지 않고
   그냥 집계만 하는 화면인데도, 그룹마다 따로 팀원 조회를 해서
   방문할 때마다 교회 전체 팀원 수만큼 매번 다시 읽고 있었음.
   여기서는 교회 전체 팀원을 한 번의 쿼리로 읽어 세션 동안
   재사용하고, 실제로 팀원이 추가/수정/삭제될 때만(members.js /
   groups.js / categories.js / excel.js) 캐시를 비운다.
   ========================================================= */
let _allMembersCache = null; // [{ id, groupId, name, birthday, ... }]

async function getAllChurchMembers(opts = {}) {
  if (!opts.force && _allMembersCache) return _allMembersCache;
  const snap = await churchCol("members").get();
  _allMembersCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return _allMembersCache;
}

function invalidateAllMembersCache() {
  _allMembersCache = null;
}
