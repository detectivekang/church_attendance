/* =========================================================
   전역 상태
   ========================================================= */
let currentUser = null;
let currentRole = null;
let roleScope = {};

/* [신규] 다중 교회(멀티테넌시) 지원
   - 한 계정은 하나의 교회에만 소속됨(가입 시 결정)
   - churchId는 해당 교회의 고유 코드(랜덤 발급, 일반가입 시 이 코드로 가입)
   - churchDoc은 churches/{churchId} 문서 캐시(이름/로고/요금제 등) */
let currentChurchId = null;
let churchDoc = null;

/* [신규] 다중 역할 지원 - 한 사람이 여러 교회/팀의 역할을 겸할 수 있으므로,
   roles 문서의 단일 role 대신 "역할 컨텍스트" 배열을 들고 있다가
   그중 하나를 활성 컨텍스트로 사용함.
   컨텍스트 형태: { role: "admin"|"leader"|"operator"|"none", churchId, groupId?, categoryId?, label? } */
let userContexts = [];
let activeContextIndex = 0;

let categories = [];
let categoriesCache = {};
let groups = [];
let selectedCategoryId = null;
let currentGroupData = null;
let selectedGroupId = null;

let members = []; // 그룹 상세 화면의 실제 팀원 + (설정 시) 팀장 가상 항목 포함
let services = [];
let attendance = {};
let currentServiceId = null;
let selectedYear = new Date().getFullYear();

let usersList = []; // 우리 교회에 가입한 유저 목록 {email, name}
let editingMemberId = null;
let editingGroupId = null;
let editingCategoryId = null;

/* 그룹 관리 화면의 "전체 그룹 상세 통계" 캐시 (요약/상세 테이블에서 공유) */
let categoryDetailData = [];
let categoryDetailOpen = false;

/* [신규] 공지사항 관리 화면용 캐시 (관리자 모달에서만 사용) */
let notices = [];
