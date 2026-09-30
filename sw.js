/*
  sw.js — the "service worker": makes the website open even WITHOUT internet.

  The browser runs this small helper in the background. Every time a file
  of the app is loaded, a copy is kept in the browser's cache. If later
  there's no internet, the saved copy is used instead.

  "Network first": when online she always gets the newest version of the
  app; the saved copy is only used when offline.

  (This only runs on a real website, e.g. GitHub Pages or localhost —
   not when index.html is opened by double-clicking. That way works
   offline anyway, because the files are already on her computer.)
*/

const CACHE_NAME = 'research-shelf-v2';
const APP_FILES = [
  './', 'index.html', 'css/styles.css',
  'js/db.js', 'js/app.js', 'js/library.js', 'js/seed.js', 'js/notes.js', 'js/files.js', 'js/themes.js',
  'js/questions.js', 'js/matrix.js', 'js/citations.js', 'js/backup.js', 'js/dashboard.js'
];

// First visit: save all the app's files
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_FILES); }));
  self.skipWaiting();
});

// Remove caches from older versions of this file
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

// Every request for one of our own files: try the internet, fall back to the saved copy
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return; // e.g. Open Library: leave alone
  event.respondWith(
    fetch(request).then(function (response) {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(request, { ignoreSearch: true }).then(function (saved) {
        return saved || caches.match('index.html');
      });
    })
  );
});
