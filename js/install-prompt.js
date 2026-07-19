/* =========================================================
   [신규] PWA 설치(홈 화면 추가) 유도
   - 서비스워커 등록 (설치 가능 요건 + 오프라인 시 최소 화면)
   - Android/Chrome 계열: beforeinstallprompt 이벤트를 잡아뒀다가
     "설치" 버튼을 누르면 그 시점에 네이티브 설치창을 띄움
   - iOS Safari: beforeinstallprompt 자체가 없어서, 버튼을 누르면
     "공유 → 홈 화면에 추가" 방법을 안내하는 모달을 대신 보여줌
   - 이미 설치되어 앱으로 실행 중이면(standalone) 배너를 아예 숨김
   ========================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* 서비스워커 등록 실패는 조용히 무시 (설치 유도만 못 할 뿐, 앱 사용엔 지장 없음) */
    });
  });
}

const INSTALL_DISMISS_KEY = "installBannerDismissedAt";
const INSTALL_DISMISS_DAYS = 14;

function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasInstallBannerDismissedRecently() {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const days = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
    return days < INSTALL_DISMISS_DAYS;
  } catch (e) {
    return false;
  }
}

let deferredInstallPrompt = null;

function showInstallBanner() {
  if (isRunningStandalone() || wasInstallBannerDismissedRecently()) return;
  document.getElementById("installBanner").style.display = "flex";
}

/* Android/Chrome 계열 - 설치 가능한 상태가 되면 브라우저가 이 이벤트를 보냄 */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

/* iOS는 beforeinstallprompt가 없으므로, 페이지 로드 후 바로 배너를 보여줌
   (아이폰/아이패드일 때만) */
if (isIosDevice()) {
  showInstallBanner();
}

document
  .getElementById("installBannerBtn")
  .addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch (e) {
        /* 무시 */
      }
      deferredInstallPrompt = null;
      document.getElementById("installBanner").style.display = "none";
    } else if (isIosDevice()) {
      document.getElementById("iosInstallModalOverlay").style.display = "flex";
    }
  });

document
  .getElementById("installBannerCloseBtn")
  .addEventListener("click", () => {
    document.getElementById("installBanner").style.display = "none";
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    } catch (e) {
      /* 무시 */
    }
  });

document
  .getElementById("closeIosInstallModalBtn")
  .addEventListener("click", () => {
    document.getElementById("iosInstallModalOverlay").style.display = "none";
  });
document
  .getElementById("iosInstallModalOverlay")
  .addEventListener("click", (e) => {
    if (e.target.id === "iosInstallModalOverlay") {
      document.getElementById("iosInstallModalOverlay").style.display = "none";
    }
  });

/* 앱이 실제로 설치 완료됐을 때(선택적 로그용, 화면엔 영향 없음) */
window.addEventListener("appinstalled", () => {
  document.getElementById("installBanner").style.display = "none";
});
