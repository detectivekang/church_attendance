/* =========================================================
   [신규] 서비스 워커
   - 목적: PWA 설치(홈 화면 추가) 요건 충족 + 오프라인일 때 최소한의
     화면(App Shell)을 보여주기 위함
   - 캐시보다 "최신 코드"가 항상 우선되도록 network-first 전략을 씀
     (출석 데이터 자체는 Firestore 실시간 통신이라 서비스워커가 캐시하지
     않음 - 여기서 캐시하는 건 정적 파일(index.html/css/js/아이콘)뿐)
   - 배포할 때마다 CACHE_NAME의 버전 숫자를 올려주면, 이전 캐시는
     activate 단계에서 자동으로 정리됨
   ========================================================= */
const CACHE_NAME = "church-attendance-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon.jpg",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  /* Firebase(인증/DB) 요청이나 외부 CDN 요청은 서비스워커가 건드리지 않고
     그대로 네트워크로 흘려보냄 */
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) {
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html"))),
  );
});
