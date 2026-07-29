
const CACHE_NAME = 'anomalies-v2.08-vangogh minecraft';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/main.css',
  './js/heic2any.min.js',
  './js/app.js',
  './js/core/ImageLoader.js',
  './js/core/CanvasPool.js',
  './js/engines/PixelArtEngine.js',
  './js/engines/ThermalPaperEngine.js',
  './js/engines/AsciiMatrixEngine.js',
  './js/engines/CrtTvEngine.js',
  './js/engines/FlirThermalEngine.js',
  './js/engines/CmykOffsetEngine.js',
  './js/engines/PunkFanzineEngine.js',
  './js/engines/ColorClashEngine.js',
  './js/engines/GlitchEngine.js',
  './js/engines/TextGlitchEngine.js',
  './js/engines/VanGoghEngine.js',
  './js/engines/MinecraftEngine.js'
];

// Service Worker Kurulumu & Önbelleğe Alma
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Eski Önbellekleri Temizleme (Aktifleştiğinde)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// İstekleri Yakalama (Önce Cache, Yoksa Ağ)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
