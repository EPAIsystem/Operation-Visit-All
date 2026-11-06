// VGMDS offline helper. Loaded by every page after the Firebase scripts.
//  1. Registers the service worker (pages open without internet)
//  2. Lets Firestore keep a copy of data on the phone and hold changes until internet returns
//  3. Marks buttons that need internet (data-net) and explains why they wait
(function () {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  // Keep data on the phone. Call right after firebase.firestore(), before any other use.
  window.vgmEnablePersistence = function (db) {
    try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
  };

  // In the main app: a save does not wait for the server. When there is no internet the change
  // is kept on the phone and sent by Firestore as soon as internet returns.
  window.vgmQueueWrites = function () {
    try {
      var FS = firebase.firestore;
      var late = function (e) { try { window.dispatchEvent(new CustomEvent('vgm-write-failed', { detail: e })); } catch (x) {} };
      var wrap = function (proto, name) {
        if (!proto || !proto[name] || proto[name].__vgm) return;
        var orig = proto[name];
        var fn = function () {
          var p = orig.apply(this, arguments);
          return new Promise(function (res, rej) {
            var done = false;
            var t = setTimeout(function () {
              if (done) return; done = true;
              try { window.dispatchEvent(new CustomEvent('vgm-queued')); } catch (x) {}
              res(undefined);
            }, navigator.onLine ? 8000 : 250);
            p.then(function (v) { if (!done) { done = true; clearTimeout(t); res(v); } },
                   function (e) { if (!done) { done = true; clearTimeout(t); rej(e); } else late(e); });
          });
        };
        fn.__vgm = true; proto[name] = fn;
      };
      wrap(FS.DocumentReference && FS.DocumentReference.prototype, 'set');
      wrap(FS.DocumentReference && FS.DocumentReference.prototype, 'update');
      wrap(FS.DocumentReference && FS.DocumentReference.prototype, 'delete');
      wrap(FS.WriteBatch && FS.WriteBatch.prototype, 'commit');
      var C = FS.CollectionReference && FS.CollectionReference.prototype;
      if (C && C.add && !C.add.__vgm) {
        var add = function (data) { var ref = this.doc(); return ref.set(data).then(function () { return ref; }); };
        add.__vgm = true; C.add = add;
      }
    } catch (e) {}
  };

  // Red bar when there is no internet (pages that have no bar of their own get one)
  var css = document.createElement('style');
  css.textContent =
    '#vgm-off-bar{position:fixed;top:0;left:0;right:0;z-index:99999;background:#b3322b;color:#fff;text-align:center;padding:6px 10px;font:600 14px system-ui,sans-serif;display:none}' +
    'body.vgm-off #vgm-off-bar{display:block}' +
    'body.vgm-off [data-net]{opacity:.55;position:relative}' +
    'body.vgm-off [data-net]::after{content:"\\1F4F6  needs internet";position:absolute;right:6px;top:2px;font:700 10px system-ui,sans-serif;background:#b3322b;color:#fff;border-radius:8px;padding:1px 6px;pointer-events:none}';
  document.head.appendChild(css);

  function ready(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    var hasOwn = !!document.getElementById('offline-bar');
    if (!hasOwn) {
      var bar = document.createElement('div'); bar.id = 'vgm-off-bar';
      bar.textContent = '📴 No internet. You can still fill and save. It is sent when internet returns.';
      document.body.appendChild(bar);
    }
    var sync = function () { document.body.classList.toggle('vgm-off', !navigator.onLine); };
    window.addEventListener('online', sync); window.addEventListener('offline', sync); sync();
  });

  // A button that needs internet explains itself instead of failing
  var said = 0;
  document.addEventListener('click', function (ev) {
    if (navigator.onLine) return;
    var b = ev.target && ev.target.closest && ev.target.closest('[data-net]');
    if (!b) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (Date.now() - said < 1500) return; said = Date.now();
    var m = '📶 This needs internet. Connect and try again.';
    if (typeof window.toast === 'function') window.toast(m, 'err'); else window.alert(m);
  }, true);
})();
