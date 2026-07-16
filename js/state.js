/* =========================================================
   전역 상태
   ========================================================= */
let currentUser = null;
let currentRole = null;
let roleScope = {};

/* [수정] 회원가입(교회 가입/일반 가입) 진행 중에는 Firebase가 계정 생성
   직후 바로 쏘는 onAuthStateChanged가 아직 작성되지 않은(교회/역할 문서가
   없는) 상태를 읽어 "권한없음"/"승인 대기" 화면으로 먼저 라우팅해버리고,
   그 뒤에 회원가입 코드가 명시적으로 다시 라우팅해도 순서가 뒤바뀌어
   결국 잘못된 화면에 머무르는 경합이 있었음. 회원가입 함수가 모든 문서
   작성을 마치고 스스로 라우팅할 때까지 onAuthStateChanged의 자동
   라우팅을 완전히 건너뛰도록 이 플래그로 막음 */
let suppressAutoRoute = false;

/* [신규] 멀티테넌트(교회별 데이터 분리) - 로그인한 사용자가 속한 교회 ID와
   그 교회 문서(이름/코드/요금제/승인상태) 캐시. superadmin(관리자)은
   특정 교회에 속하지 않으므로 null로 유지됨 */
let currentChurchId = null;
let currentChurchData = null;

/* [신규] 다중 역할 지원 - 한 사람이 여러 팀의 팀장이거나
   팀장+운영자를 동시에 겸할 수 있으므로, roles 문서의 단일 role 대신
   "역할 컨텍스트" 배열을 들고 있다가 그중 하나를 활성 컨텍스트로 사용함.
   컨텍스트 형태: { role: "leader"|"operator", groupId?, categoryId?, label? } */
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

let usersList = []; // 가입한 전체 유저 {email, name}
let editingMemberId = null;
let editingGroupId = null;
let editingCategoryId = null;

/* 그룹 관리 화면의 "전체 그룹 상세 통계" 캐시 (요약/상세 테이블에서 공유) */
let categoryDetailData = [];
let categoryDetailOpen = false;

/* [신규] 공지사항 관리 화면용 캐시 (관리자 모달에서만 사용) */
let notices = [];
