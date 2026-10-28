// Cache dos arquivos do app para uso offline no campo.
// Ao alterar qualquer arquivo listado, incremente a versão.
const VERSAO = "ateg-cal-v14";
const ARQUIVOS = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/config.js",
  "js/ui/login.js",
  "js/ui/comum.js",
  "js/ui/rebanho.js",
  "js/ui/previsao.js",
  "js/ui/corte.js",
  "js/calc/rebanho.js",
  "js/calc/previsao.js",
  "js/calc/corte.js",
  "js/dados/municipios.json",
  "manifest.webmanifest",
  "icons/favicon-64.png",
  "icons/logo-empresa.jpg",
  "icons/logo-96.png",
  "icons/logo-280.png",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? fetch(e.request)));
});
