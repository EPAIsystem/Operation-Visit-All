// VGMDS service worker: lets the app open without internet.
// Pages are fetched from the network first (so people get the newest version) and a copy is kept;
// when there is no internet (or it is very slow) the kept copy is used.
const V = 'vgmds-v3';
const SHELL = ['/', 'index.html', 'biodata.html', 'elders.html', 'form.html', 'firebase-config.js', 'offline.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const CDN = [
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await Promise.all(CDN.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

const offlinePage = () => new Response(
  '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:24px"><h2>No internet</h2><p>This page has not been opened on this phone before. Please connect to the internet once and open it again.</p></body>',
  { headers: { 'Content-Type': 'text/html' } });

async function kept(path) {
  const c = await caches.open(V);
  let m = await c.match(path);
  if (!m && (path === '/' || path.endsWith('/'))) m = await c.match('/index.html') || await c.match('index.html');
  return m || null;
}

function networkFirst(req, path) {
  return new Promise(resolve => {
    let settled = false;
    const use = r => { if (!settled && r) { settled = true; resolve(r); return true; } return false; };
    const timer = setTimeout(() => { kept(path).then(use); }, 5000);
    fetch(req).then(r => {
      clearTimeout(timer);
      if (r && r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(V).then(c => c.put(path, cp)); }
      if (!settled) { settled = true; resolve(r); }
    }).catch(() => {
      clearTimeout(timer);
      kept(path).then(m => { if (!use(m)) { settled = true; resolve(req.mode === 'navigate' ? offlinePage() : Response.error()); } });
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // one kept copy per page, whatever comes after "?"
    e.respondWith(networkFirst(req, url.pathname));
    return;
  }
  // Firebase scripts and fonts never change for a given address: keep them
  if (url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(V);
      const m = await c.match(req.url);
      if (m) return m;
      try { const r = await fetch(req); if (r && (r.ok || r.type === 'opaque')) c.put(req.url, r.clone()); return r; }
      catch (err) { return Response.error(); }
    })());
  }
  // everything else (Firebase sign-in and database calls) goes straight to the network
});
