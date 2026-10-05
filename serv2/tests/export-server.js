// Tests for export-server.js. Run from the serv2 directory: `node tests/export-server.js`
// Unlike the other tests, this doesn't need config files or the main server.

const assert = require("assert").strict;
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const argon2 = require("argon2");
const Database = require("better-sqlite3");
const fetch = require("node-fetch");
const { createApp, createHttpRedirectHandler, createSerialQueue, tagtimeLineFormatter, QueueFullError } = require("../export-server.js");

const SECRET = "test-cookie-secret";
// Cheap hashing parameters so the tests run quickly. verify() reads them from the hash.
const FAST_ARGON2 = { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const sql = name => fs.readFileSync(path.join(__dirname, "..", name), "utf-8");

const PINGS = [
    // inserted out of order to check that exports sort by time
    { time: 1600000000, tags: "work code", interval: 2700, category: null, comment: null, last_change: 7 },
    { time: 1500000000, tags: "", interval: 2700, category: null, comment: null, last_change: 5 },
    // midnight UTC, to check the hour is written as 00 rather than 24
    { time: 1599955200, tags: "sleep", interval: 2700, category: "cat", comment: "a comment", last_change: 6 },
];

async function buildFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ttw-export-test-"));
    const userDbDir = path.join(dir, "user-dbs");
    fs.mkdirSync(userDbDir);

    const globalDb = new Database(path.join(dir, "global.db"));
    globalDb.exec(sql("initGlobalDb.sql"));
    const addUser = globalDb.prepare("INSERT INTO users (id, username, pw, register_date, plan) VALUES (?, ?, ?, 0, 1)");
    addUser.run(1, "alice", await argon2.hash("alice password", FAST_ARGON2));
    // has an account but no user database
    addUser.run(2, "bob", await argon2.hash("bob password", FAST_ARGON2));
    // it used to be possible to register a duplicate username; the oldest account wins
    addUser.run(3, "alice", await argon2.hash("newer alice password", FAST_ARGON2));
    // has a large database, for testing cancelled downloads
    addUser.run(4, "carol", await argon2.hash("carol password", FAST_ARGON2));
    globalDb.close();

    const authDb = new Database(path.join(dir, "auth.db"));
    authDb.exec(sql("initAuthDb.sql"));
    const addToken = authDb.prepare("INSERT INTO tokens (user_id, token_data, created) VALUES (?, ?, 0)");
    addToken.run(1, "1.legacycookie");
    addToken.run(1, "api!1.apitoken");
    addToken.run(4, "api!4.bigtoken");
    authDb.close();

    const userDb = new Database(path.join(userDbDir, "1.db"));
    userDb.exec(sql("initUserDb.sql"));
    const addPing = userDb.prepare("INSERT INTO pings (time, tags, interval, category, comment, last_change) VALUES (@time, @tags, @interval, @category, @comment, @last_change)");
    PINGS.forEach(ping => addPing.run(ping));
    userDb.prepare("INSERT INTO meta (k, v) VALUES ('retag-pint-interval', '2700')").run();
    userDb.close();

    const bigDb = new Database(path.join(userDbDir, "4.db"));
    bigDb.exec(sql("initUserDb.sql"));
    bigDb.prepare("INSERT INTO meta (k, v) VALUES ('filler', ?)").run("x".repeat(32 * 1024 * 1024));
    bigDb.close();

    // the export server must work on read-only data
    for (const file of fs.readdirSync(userDbDir)) fs.chmodSync(path.join(userDbDir, file), 0o444);
    fs.chmodSync(path.join(dir, "global.db"), 0o444);
    fs.chmodSync(path.join(dir, "auth.db"), 0o444);
    fs.chmodSync(userDbDir, 0o555);
    fs.chmodSync(dir, 0o555);
    return { dir, userDbDir };
}

function removeFixture(dir) {
    fs.chmodSync(dir, 0o755);
    fs.chmodSync(path.join(dir, "user-dbs"), 0o755);
    fs.rmSync(dir, { recursive: true, force: true });
}

// sha256 of every file under dir, keyed by relative path
function snapshot(dir, prefix = "") {
    const out = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(prefix, entry.name);
        if (entry.isDirectory()) {
            Object.assign(out, snapshot(path.join(dir, entry.name), rel));
        } else {
            out[rel] = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, entry.name))).digest("hex");
        }
    }
    return out;
}

// Signs a cookie value the same way cookie-parser does
function signCookie(value, secret) {
    return value + "." + crypto.createHmac("sha256", secret).update(value).digest("base64").replace(/=+$/, "");
}

function cspHash(source) {
    return "'sha256-" + crypto.createHash("sha256").update(source, "utf8").digest("base64") + "'";
}

async function testQueue() {
    // runs tasks one at a time, in order
    {
        const run = createSerialQueue(10);
        let active = 0;
        let maxActive = 0;
        const order = [];
        const task = (n, ms) => async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, ms));
            order.push(n);
            active--;
            return n;
        };
        const results = await Promise.all([run(task(1, 30)), run(task(2, 5)), run(task(3, 1))]);
        assert.deepEqual(results, [1, 2, 3]);
        assert.deepEqual(order, [1, 2, 3]);
        assert.equal(maxActive, 1);
    }

    // rejects when full, recovers afterwards, and survives failing tasks
    {
        const run = createSerialQueue(2);
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const first = run(() => gate);
        const second = run(() => Promise.reject(new Error("task failed")));
        const third = run(() => 3);
        release(1);
        await assert.rejects(third, QueueFullError);
        assert.equal(await first, 1);
        await assert.rejects(second, /task failed/);
        assert.equal(await run(() => 4), 4);
    }
}

function testFormatter() {
    const utc = tagtimeLineFormatter("UTC");
    assert.equal(
        utc({ time: 1600000000, tags: ["work", "code"] }),
        "1600000000 work code                                  [2020.09.13 12:26:40 SUN]"
    );
    assert.equal(
        utc({ time: 1599955200, tags: ["sleep"] }),
        "1599955200 sleep                                      [2020.09.13 00:00:00 SUN]"
    );
    // a long line still gets one space before the date
    const longTags = ["a".repeat(30), "b".repeat(30)];
    assert.equal(
        utc({ time: 1600000000, tags: longTags }),
        `1600000000 ${longTags.join(" ")} [2020.09.13 12:26:40 SUN]`
    );
    const toronto = tagtimeLineFormatter("America/Toronto");
    assert.equal(
        toronto({ time: 1500000000, tags: [] }),
        "1500000000                                            [2017.07.13 22:40:00 THU]"
    );
}

async function testServer() {
    const { dir, userDbDir } = await buildFixture();
    const before = snapshot(dir);
    const app = createApp({
        cookieSecret: SECRET,
        globalDbPath: path.join(dir, "global.db"),
        authDbPath: path.join(dir, "auth.db"),
        userDbDir,
        appName: "Test App",
        contactEmail: "admin@example.com",
        extraHtml: "<p id=extra>Extra <em>notice</em></p>",
    });
    const server = await new Promise(resolve => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const req = (urlPath, opts = {}) => fetch(base + urlPath, { redirect: "manual", ...opts });
    const login = (username, pw) => req("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, pw }).toString(),
    });

    try {
        // logged out home page
        {
            const res = await req("/");
            assert.equal(res.status, 200);
            const html = await res.text();
            assert(html.includes("Test App has shut down"));
            assert(html.includes("You can still log in to download your data.</p>"));
            assert(html.includes("<p id=extra>Extra <em>notice</em></p>"));
            assert(html.includes('action="/login"'));
            assert(html.includes("mailto:admin@example.com"));
            assert(!html.includes("/export/"));
            assert.equal(res.headers.get("cache-control"), "no-store");
            assert.equal(res.headers.get("x-frame-options"), "DENY");
            assert(res.headers.get("content-security-policy").includes("default-src 'none'"));
        }

        // failed logins
        for (const [username, pw] of [
            ["alice", "wrong password"],
            ["nobody", "alice password"],
            ["al1ce", "alice password"],
            ["alice", ""],
            // the newer duplicate account can't be logged into, same as the old server
            ["alice", "newer alice password"],
        ]) {
            const res = await login(username, pw);
            assert.equal(res.status, 200, `${username}/${pw}`);
            assert.equal(res.headers.get("set-cookie"), null);
            assert((await res.text()).includes("Incorrect username or password."));
        }

        // an oversized login form is a client error, not a logged server error
        {
            const logged = [];
            const realConsoleError = console.error;
            console.error = (...args) => logged.push(args);
            try {
                const res = await login("alice", "x".repeat(30 * 1024));
                assert.equal(res.status, 413);
                assert((await res.text()).includes("Bad request"));
            } finally {
                console.error = realConsoleError;
            }
            assert.deepEqual(logged, []);
        }

        // successful login, with the username in a different case and padded
        const loginRes = await login(" ALICE ", "alice password");
        assert.equal(loginRes.status, 303);
        assert.equal(new URL(loginRes.headers.get("location"), base).pathname, "/");
        const setCookie = loginRes.headers.raw()["set-cookie"];
        assert.equal(setCookie.length, 1);
        assert(setCookie[0].startsWith("ttw-export=s%3A1."));
        assert(/HttpOnly/i.test(setCookie[0]));
        assert(/SameSite=Lax/i.test(setCookie[0]));
        const session = setCookie[0].split(";")[0];
        const authed = { headers: { Cookie: session } };

        // logged in home page, including the CSP hashes for the inline script and style
        {
            const res = await req("/", authed);
            const html = await res.text();
            assert(html.includes("logged in as <strong>alice</strong>"));
            for (const target of ["/export/tags.log", "/export/pings.json", "/export/user.db"]) {
                assert(html.includes(`action="${target}"`), target);
            }
            const csp = res.headers.get("content-security-policy");
            const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
            const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
            assert(csp.includes(`script-src ${cspHash(script)}`));
            assert(csp.includes(`style-src ${cspHash(style)}`));
        }

        // database download is byte for byte the user's database
        {
            const res = await req("/export/user.db", authed);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get("content-type"), "application/vnd.sqlite3");
            assert.equal(res.headers.get("content-disposition"), 'attachment; filename="alice.db"');
            const body = await res.buffer();
            assert(body.equals(fs.readFileSync(path.join(userDbDir, "1.db"))));
        }

        // JSON export
        const expectedJson = {
            username: "alice",
            pings: [...PINGS]
                .sort((a, b) => a.time - b.time)
                .map(p => ({ ...p, tags: p.tags === "" ? [] : p.tags.split(" ") })),
            config: { ver: "1", "retag-pint-interval": "2700" },
        };
        {
            const res = await req("/export/pings.json", authed);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get("content-disposition"), 'attachment; filename="alice-pings.json"');
            assert(res.headers.get("content-type").startsWith("application/json"));
            assert.deepEqual(await res.json(), expectedJson);
        }

        // TagTime log, in UTC by default and in a requested time zone
        {
            const res = await req("/export/tags.log", authed);
            assert.equal(res.status, 200);
            assert.equal(res.headers.get("content-disposition"), 'attachment; filename="alice-tags.log"');
            assert.equal(await res.text(),
                "1500000000                                            [2017.07.14 02:40:00 FRI]\n" +
                "1599955200 sleep                                      [2020.09.13 00:00:00 SUN]\n" +
                "1600000000 work code                                  [2020.09.13 12:26:40 SUN]\n");
            const zoned = await req("/export/tags.log?tz=America%2FToronto", authed);
            assert.equal(await zoned.text(),
                "1500000000                                            [2017.07.13 22:40:00 THU]\n" +
                "1599955200 sleep                                      [2020.09.12 20:00:00 SAT]\n" +
                "1600000000 work code                                  [2020.09.13 08:26:40 SUN]\n");
            const bad = await req("/export/tags.log?tz=Not%2FAZone", authed);
            assert.equal(bad.status, 400);
        }

        // exports need a login
        for (const target of ["/export/user.db", "/export/pings.json", "/export/tags.log", "/db"]) {
            assert.equal((await req(target)).status, 403, target);
        }

        // tampered and expired session cookies are rejected
        {
            const tampered = session.replace("ttw-export=s%3A1.", "ttw-export=s%3A2.");
            assert.equal((await req("/export/pings.json", { headers: { Cookie: tampered } })).status, 403);
            const expired = "ttw-export=" + encodeURIComponent("s:" + signCookie(`1.${Date.now() - 1000}`, SECRET));
            assert.equal((await req("/export/pings.json", { headers: { Cookie: expired } })).status, 403);
            const fresh = "ttw-export=" + encodeURIComponent("s:" + signCookie(`1.${Date.now() + 60000}`, SECRET));
            assert.equal((await req("/export/pings.json", { headers: { Cookie: fresh } })).status, 200);
            const wrongSecret = "ttw-export=" + encodeURIComponent("s:" + signCookie(`1.${Date.now() + 60000}`, "other"));
            assert.equal((await req("/export/pings.json", { headers: { Cookie: wrongSecret } })).status, 403);
        }

        // old login cookies from the main server still work
        {
            const legacy = { headers: { Cookie: "retag-auth=1.legacycookie" } };
            assert((await (await req("/", legacy)).text()).includes("logged in as <strong>alice</strong>"));
            assert.deepEqual(await (await req("/export/pings.json", legacy)).json(), expectedJson);
            const unknown = { headers: { Cookie: "retag-auth=1.notatoken" } };
            assert.equal((await req("/export/pings.json", unknown)).status, 403);
        }

        // API tokens work, including on the old /db endpoint
        {
            const api = { headers: { Authorization: "Bearer ttwprivate_api!1.apitoken" } };
            assert.deepEqual(await (await req("/export/pings.json", api)).json(), expectedJson);
            const db = await req("/db", api);
            assert.equal(db.status, 200);
            assert.equal(db.headers.get("content-disposition"), 'attachment; filename="user.db"');
            assert((await db.buffer()).equals(fs.readFileSync(path.join(userDbDir, "1.db"))));
            const badToken = { headers: { Authorization: "Bearer ttwprivate_api!1.wrong" } };
            assert.equal((await req("/export/pings.json", badToken)).status, 403);
            // an Authorization header takes precedence over cookies, like the old server
            const badTokenGoodCookie = { headers: { Authorization: "Bearer nope", Cookie: session } };
            assert.equal((await req("/export/pings.json", badTokenGoodCookie)).status, 403);
            // the rest of the old API is gone
            assert.equal((await req("/pings", api)).status, 410);
        }

        // cancelling a download partway through closes the file
        {
            const streams = [];
            const realCreateReadStream = fs.createReadStream;
            fs.createReadStream = (...args) => {
                const stream = realCreateReadStream(...args);
                streams.push(stream);
                return stream;
            };
            try {
                await new Promise((resolve, reject) => {
                    const clientReq = http.get(base + "/export/user.db", {
                        headers: { Authorization: "Bearer ttwprivate_api!4.bigtoken" },
                    }, res => {
                        assert.equal(res.statusCode, 200);
                        assert(Number(res.headers["content-length"]) > 32 * 1024 * 1024);
                        // stop reading so the server is stuck partway through the file, then disconnect
                        res.once("data", () => {
                            res.pause();
                            setTimeout(() => {
                                clientReq.destroy();
                                resolve();
                            }, 200);
                        });
                    });
                    clientReq.on("error", err => { if (err.code !== "ECONNRESET") reject(err); });
                });
            } finally {
                fs.createReadStream = realCreateReadStream;
            }
            assert.equal(streams.length, 1);
            const [stream] = streams;
            for (let i = 0; i < 40 && !stream.destroyed; i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert(stream.destroyed, "file left open after the download was cancelled");
            assert(stream.bytesRead < 32 * 1024 * 1024, "the whole file was read before cancelling");
        }

        // an account without a user database
        {
            const res = await login("bob", "bob password");
            assert.equal(res.status, 303);
            const bob = { headers: { Cookie: res.headers.raw()["set-cookie"][0].split(";")[0] } };
            assert((await (await req("/", bob)).text()).includes("logged in as <strong>bob</strong>"));
            assert.equal((await req("/export/pings.json", bob)).status, 404);
            assert.equal((await req("/export/tags.log", bob)).status, 404);
            assert.equal((await req("/export/user.db", bob)).status, 404);
        }

        // logout clears both the session and old login cookies
        {
            const res = await req("/logout", { method: "POST", headers: { Cookie: session } });
            assert.equal(res.status, 303);
            const cleared = res.headers.raw()["set-cookie"];
            assert(cleared.some(c => c.startsWith("ttw-export=;") && c.includes("Expires=Thu, 01 Jan 1970")));
            assert(cleared.some(c => c.startsWith("retag-auth=;") && c.includes("Expires=Thu, 01 Jan 1970")));
        }

        // service worker that removes the old app
        {
            const res = await req("/sw.js");
            assert.equal(res.status, 200);
            assert(res.headers.get("content-type").startsWith("text/javascript"));
            assert.equal(res.headers.get("cache-control"), "no-cache");
            const body = await res.text();
            assert(body.includes("self.registration.unregister()"));
            assert(body.includes("caches.delete"));
        }

        // old app pages redirect to the shutdown page, other old endpoints are gone
        for (const oldPage of ["/app", "/settings", "/graphs/trend/daily", "/internal/login", "/internal/register", "/welcome"]) {
            const res = await req(oldPage);
            assert.equal(res.status, 302, oldPage);
            assert.equal(new URL(res.headers.get("location"), base).pathname, "/");
        }
        assert.equal((await req("/pings", { method: "PATCH", body: "{}" })).status, 410);
        assert.equal((await req("/internal/register", { method: "POST" })).status, 410);
        assert.equal((await req("/db", { method: "DELETE", headers: { Cookie: session } })).status, 410);

        // nothing was written
        assert.deepEqual(snapshot(dir), before);
    } finally {
        server.close();
        removeFixture(dir);
    }
}

async function testHttpRedirect() {
    const webroot = fs.mkdtempSync(path.join(os.tmpdir(), "ttw-acme-test-"));
    fs.mkdirSync(path.join(webroot, ".well-known", "acme-challenge"), { recursive: true });
    fs.writeFileSync(path.join(webroot, ".well-known", "acme-challenge", "tok-EN_1"), "tok-EN_1.thumbprint");
    fs.writeFileSync(path.join(webroot, "secret.txt"), "not served");
    const server = await new Promise(resolve => {
        const s = http.createServer(createHttpRedirectHandler(webroot)).listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (urlPath, options = {}) => fetch(base + urlPath, { redirect: "manual", ...options });
    try {
        // certbot's challenge files are served, nothing else is
        let res = await get("/.well-known/acme-challenge/tok-EN_1", { headers: { Host: "export.example.com" } });
        assert.equal(res.status, 200);
        assert.equal(await res.text(), "tok-EN_1.thumbprint");
        assert.equal((await get("/.well-known/acme-challenge/missing")).status, 404);
        res = await get("/.well-known/acme-challenge/..%2Fsecret.txt", { headers: { Host: "export.example.com" } });
        assert.equal(res.status, 301);
        assert.equal((await get("/.well-known/acme-challenge/tok-EN_1", { method: "POST", headers: { Host: "a.example.com" } })).status, 301);

        // everything else redirects to the same place over HTTPS
        res = await get("/export/tags.log?tz=UTC", { headers: { Host: "export.example.com:80" } });
        assert.equal(res.status, 301);
        assert.equal(res.headers.get("location"), "https://export.example.com/export/tags.log?tz=UTC");
        assert.equal((await get("/", { headers: { Host: "bad host/" } })).status, 400);

        // without a webroot, challenges redirect too
        const plain = createHttpRedirectHandler(null);
        const headers = {};
        let status;
        plain({ url: "/.well-known/acme-challenge/tok-EN_1", method: "GET", headers: { host: "a.example.com" } },
            { writeHead: (s, h) => { status = s; Object.assign(headers, h); }, end: () => {} });
        assert.equal(status, 301);
        assert.equal(headers.Location, "https://a.example.com/.well-known/acme-challenge/tok-EN_1");
    } finally {
        server.close();
        fs.rmSync(webroot, { recursive: true, force: true });
    }
}

// If a test leaves a promise hanging, Node exits once nothing is left to run.
// Treat that as a failure rather than a silent success.
process.exitCode = 1;
(async () => {
    await testQueue();
    testFormatter();
    await testServer();
    await testHttpRedirect();
    console.log("export server tests passed");
    process.exitCode = 0;
})().catch(e => {
    console.error(e);
    process.exit(1);
});
