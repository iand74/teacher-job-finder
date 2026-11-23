// Teacher Jobs service worker: offline copy, and a background check that puts
// the number of new jobs on the home-screen icon where the phone supports it.
const SHELL = "tjf-shell-v3";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "index.html", "manifest.json", "icon-192.png"]))); });
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put(u.pathname, copy)); return r; })
    .catch(() => caches.match(u.pathname).then(r => r || caches.match("index.html"))));
});
async function checkJobs() {
  const d = await (await fetch("jobs.json?t=" + Date.now(), { cache: "no-store" })).json();
  const now = new Date();
  const ids = (d.jobs || []).filter(j => new Date(j.closes) >= now).map(j => j.url);
  const r = await (await caches.open("tjf-state")).match("seen");
  if (!r) return;
  const seen = await r.json();
  const n = ids.filter(id => !seen.includes(id)).length;
  if (self.navigator.setAppBadge) { n ? await self.navigator.setAppBadge(n) : await self.navigator.clearAppBadge(); }
}
self.addEventListener("periodicsync", e => { if (e.tag === "jobs-check") e.waitUntil(checkJobs().catch(() => {})); });

// Push from the GitHub notifier: {title, body, count, ids}
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil((async () => {
    let n = d.count || 0;
    try {
      const r = await (await caches.open("tjf-state")).match("seen");
      if (r && Array.isArray(d.ids)) { const seen = await r.json(); n = d.ids.filter(id => !seen.includes(id)).length || n; }
    } catch (_) {}
    try { if (self.navigator.setAppBadge && n) await self.navigator.setAppBadge(n); } catch (_) {}
    await self.registration.showNotification(d.title || "New teacher jobs", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" } });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow("./")));
});
