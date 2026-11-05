// Lets the phone install VGMDS like an app. It keeps no copy of the pages,
// so people always get the newest version when they are online.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:24px"><h2>No internet</h2><p>Please connect to the internet and open the app again.</p></body>',
      { headers: { 'Content-Type': 'text/html' } })));
  }
});
