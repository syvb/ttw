// Tests for shutdown-worker.mjs. Run from the serv2 directory: `node tests/shutdown-worker.js`

const assert = require("assert").strict;
const { SW_SCRIPT } = require("../export-server.js");

(async () => {
    const worker = (await import("../shutdown-worker.mjs")).default;

    // the replacement service worker is served from the old domain, matching export-server.js
    let res = await worker.fetch(new Request("https://ttw.smitop.com/sw.js"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal(res.headers.get("cache-control"), "no-cache");
    assert.equal(await res.text(), SW_SCRIPT);

    // everything else redirects to the export server, keeping the path and query
    res = await worker.fetch(new Request("https://ttw.smitop.com/app?x=1"));
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), "https://export.ttw.smitop.com/app?x=1");
    res = await worker.fetch(new Request("https://ttwbackend.smitop.com/pings", { method: "PATCH", body: "{}" }));
    assert.equal(res.status, 301);
    assert.equal(res.headers.get("location"), "https://export.ttw.smitop.com/pings");

    // API token requests are passed through with the token
    const realFetch = globalThis.fetch;
    let proxied;
    globalThis.fetch = async request => {
        proxied = request;
        return new Response("db bytes", { status: 200 });
    };
    try {
        res = await worker.fetch(new Request("https://ttwbackend.smitop.com/db?a=b", { headers: { Authorization: "Bearer ttwprivate_x" } }));
    } finally {
        globalThis.fetch = realFetch;
    }
    assert.equal(await res.text(), "db bytes");
    assert.equal(proxied.url, "https://export.ttw.smitop.com/db?a=b");
    assert.equal(proxied.method, "GET");
    assert.equal(proxied.headers.get("authorization"), "Bearer ttwprivate_x");

    console.log("Shutdown worker tests passed");
})().catch(e => {
    console.error(e);
    process.exit(1);
});
