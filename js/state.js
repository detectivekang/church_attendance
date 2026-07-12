/* =========================================================
   전역 상태
   ========================================================= */
let currentUser = null;
let currentRole = null;
let roleScope = {};

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
