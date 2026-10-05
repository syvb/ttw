// Cloudflare Worker for the old frontend (and optionally backend) domains of a
// shut-down instance. Route the old domains to it, such as ttw.smitop.com/* and
// ttwbackend.smitop.com/*.
//
// - /sw.js returns a service worker that replaces the old app's one. Installed
//   copies of the app run from the old service worker's cache without asking
//   the server, and only an update from the same domain can replace it. A
//   redirect isn't accepted as an update.
// - Requests with an API token are passed to the export server, since most
//   clients drop the token when following a redirect to another domain.
// - Everything else redirects to the export server.
//
// SW_SCRIPT must match the one in export-server.js; tests/shutdown-worker.js checks this.

const EXPORT_ORIGIN = "https://export.ttw.smitop.com";

const SW_SCRIPT = `// This instance has shut down. This service worker replaces the old app's one.
// It deletes the old app's caches, unregisters itself, and reloads open tabs so
// they load the shutdown page from the server.
self.addEventListener("install", function () {
    self.skipWaiting();
});
self.addEventListener("activate", function (event) {
    event.waitUntil((async function () {
        const keys = await caches.keys();
        await Promise.all(keys.map(function (key) { return caches.delete(key); }));
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach(function (client) { client.navigate(client.url); });
    })());
});
`;

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/sw.js") {
            return new Response(SW_SCRIPT, {
                headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" },
            });
        }
        const target = EXPORT_ORIGIN + url.pathname + url.search;
        if (request.headers.has("Authorization")) {
            return fetch(new Request(target, request));
        }
        return Response.redirect(target, 301);
    },
};
