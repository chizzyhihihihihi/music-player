/* Accordion Music service worker — hand-written, no build step.
 * App-shell precache + CDN/image runtime caching. Works from any
 * subpath (GitHub Pages project sites) via relative-URL caching.
 */
var CACHE = 'accordion-music-v1';

var PRECACHE = [
  './',
  './index.html',
  './css/app.css',
  './css/accordion-gallery.css',
  './js/app.js',
  './js/gallery.js',
  './js/library.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE);
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            if (k !== CACHE) return caches.delete(k);
            return Promise.resolve(true);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isCdn(url) {
  return (
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'picsum.photos' ||
    url.hostname === 'fastly.picsum.photos'
  );
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  // Never intercept blobs or range (media streaming) requests.
  if (url.protocol === 'blob:' || url.protocol === 'data:') return;
  if (req.headers.has('range')) return;
  // Don't cache remote audio streams; just pass through.
  if (
    url.hostname === 'www.soundhelix.com' ||
    /\.(mp3|ogg|oga|wav|m4a|flac|opus|webm)(\?|$)/i.test(url.pathname)
  ) {
    return;
  }

  // Navigations: network-first, fall back to cached app shell (offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put('./index.html', copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (hit) {
            return hit || caches.match('./');
          });
        })
    );
    return;
  }

  // CDN + demo art: cache-first, refresh in background.
  if (isCdn(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req)
          .then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) {
              var copy = res.clone();
              caches.open(CACHE).then(function (cache) {
                cache.put(req, copy);
              });
            }
            return res;
          })
          .catch(function () {
            return hit;
          });
        return hit || net;
      })
    );
    return;
  }

  // Same-origin assets: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        });
      })
    );
  }
});
