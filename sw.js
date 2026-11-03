'use strict';
// Version bump invalidates the cached pre-refactor shell. Cache only public code assets.
const VERSION='meu-financeiro-shell-v2-16-oauth-diagnostics';
const ASSETS=["./","./index.html","./manifest.webmanifest","./icons/icon.svg","./css/base.css","./css/mobile.css","./js/core/shared.js","./js/core/vault.js","./js/core/biometrics.js","./js/core/session.js","./js/core/auto-sync.js","./js/vendor/pdf.min.js","./js/vendor/pdf.worker.min.js","./js/import/parser.js","./js/import/reconcile.js","./js/finance/taxonomy.js","./js/finance/ledger.js","./js/finance/goals.js","./js/charts/sankey.js","./js/charts/projections.js","./js/ui/dashboard.js","./js/ui/forms.js","./js/ui/banking.js","./js/ui/taxonomy.js","./js/ui/reconcile.js","./js/ui/importer.js","./js/ui/events.js","./js/assistant/parser.js","./js/assistant/entry.js","./js/assistant/voice.js","./js/assistant/receipt.js","./js/assistant/approval.js","./js/core/launch.js"];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
