/* Робопортал: помощник для работы без интернета.
   Сам он сохраняет только основу сайта (страницу, код, шрифты, иконки) — это секунды.
   Фото, видео и PDF докачивает страница (src/composables/offline.ts) в тот же склад:
   так загрузку не обрывает лимит браузера в 5 минут на одну операцию помощника (12.10.2026).
   Версия, подпапка и список основы подставляются при сборке (offlinePlugin в vite.config.ts). */

const VERSION = "7b7e9e42158b";
// Подпапка адреса, где лежит сайт (например /roboportal-lite-site/); подставляется при сборке
const BASE_RAW = "/roboportal-lite-site/";
const BASE = BASE_RAW.startsWith("/") ? BASE_RAW : "/";
const CORE = ["/roboportal-lite-site/","/roboportal-lite-site/index.html","/roboportal-lite-site/assets/index-Bi0cx0EV.css","/roboportal-lite-site/assets/index-D-ODFUp0.js","/roboportal-lite-site/assets/onest-cyrillic-B4DTQzs9.woff2","/roboportal-lite-site/assets/onest-cyrillic-ext-D3MbBdlY.woff2","/roboportal-lite-site/assets/onest-latin-BXvespbm.woff2","/roboportal-lite-site/assets/onest-latin-ext-BB1CCQzJ.woff2","/roboportal-lite-site/assets/onest-math-B6XOXjJb.woff2","/roboportal-lite-site/assets/onest-symbols-DO4Q1dvh.woff2","/roboportal-lite-site/assets/onest-vietnamese-_91sfWkv.woff2","/roboportal-lite-site/favicon.ico","/roboportal-lite-site/icon-180.png","/roboportal-lite-site/icon-192.png","/roboportal-lite-site/icon-512.png","/roboportal-lite-site/manifest.webmanifest"] || [];
const CACHE = "roboportal-" + VERSION;
const PREFIX = "roboportal-";
// Файлы без хэша в имени: при обновлении всегда скачиваются заново
const ALWAYS_FRESH = ["", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"].map(
  (f) => BASE + f,
);

async function saveCore() {
  const cache = await caches.open(CACHE);
  for (const url of CORE) {
    if (await cache.match(url)) continue;
    const old = ALWAYS_FRESH.includes(url) ? null : await caches.match(url);
    if (old) {
      await cache.put(url, old);
      continue;
    }
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await cache.put(url, res);
    } catch (e) {
      // нет сети — основа докачается при следующем заходе
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(saveCore().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Видео на iPad запрашивается кусками — отдаем нужный кусок из сохраненного файла
async function rangeResponse(request, response) {
  const range = request.headers.get("range");
  const blob = await response.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(range || "");
  if (!m) return new Response(blob, { status: 200, headers: response.headers });
  const size = blob.size;
  let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] !== "" && m[2] !== "" ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  }
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // список файлов для сохранения всегда берем свежий
  if (url.pathname === BASE + "offline-files.json") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Любая страница сайта (/robots, /finance…) — это один и тот же index.html
      const isPage = request.mode === "navigate" && !/\.[a-z0-9]+$/i.test(url.pathname);
      const cached = await cache.match(isPage ? BASE + "index.html" : url.pathname);
      if (cached) {
        return request.headers.has("range") ? rangeResponse(request, cached) : cached;
      }
      return fetch(request);
    })(),
  );
});
