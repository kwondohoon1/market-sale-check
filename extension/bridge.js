// 점검 페이지 ↔ 확장 백그라운드 사이를 잇는다.
// 페이지는 window.postMessage 로 요청하고, 여기서 백그라운드 포트로 넘긴다. 확장 ID를 몰라도 된다.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  let port = null;

  const toPage = (msg) => window.postMessage({ source: 'msc-ext', ...msg }, location.origin);

  function connect() {
    port = chrome.runtime.connect({ name: 'msc' });
    port.onMessage.addListener(toPage);
    port.onDisconnect.addListener(() => { port = null; });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'msc-page') return;
    const { type } = e.data;
    if (type === 'hello') { toPage({ type: 'ready', version: VERSION }); return; }
    if (type === 'check' || type === 'cancel') {
      if (!port) connect();
      port.postMessage({ type, jobs: e.data.jobs });
    }
  });

  document.documentElement.dataset.mscExt = VERSION;
  toPage({ type: 'ready', version: VERSION });
})();
