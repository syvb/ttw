// Tests for push-shutdown.js. Run from the serv2 directory: `node tests/push-shutdown.js`
// Nothing is actually sent: web-push is replaced with a fake.

const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { main, PUSH_TTL } = require("../push-shutdown.js");

const CONFIG = { "contact-email": "admin@example.com", "vapid-public": "pub", "vapid-private": "priv" };

function fakeWebPush(failures = {}) {
    const calls = [];
    return {
        calls,
        setVapidDetails: (...args) => { calls.push({ vapid: args }); },
        sendNotification: async (subscription, payload, options) => {
            calls.push({ subscription, payload, options });
            const failure = failures[subscription.endpoint];
            if (failure) throw Object.assign(new Error("push failed"), failure);
        },
    };
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ttw-push-test-"));
    try {
        const dbPath = path.join(dir, "global.db");
        const db = new Database(dbPath);
        db.exec(fs.readFileSync(path.join(__dirname, "..", "initGlobalDb.sql"), "utf-8"));
        const add = db.prepare("INSERT INTO pushregs (endpoint_uri, p256dh, auth, seed, alg, avg_interval) VALUES (?, ?, ?, 1, 1, 2700)");
        add.run("https://fcm.googleapis.com/fcm/send/secret1", "key1", "auth1");
        add.run("https://web.push.apple.com/secret2", "key2", "auth2");
        add.run("https://fcm.googleapis.com/fcm/send/secret3", "key3", "auth3");
        db.close();
        const run = async (argv, webPush, config = CONFIG) => {
            const lines = [];
            await main(["--global-db", dbPath, ...argv], { webPush, log: line => lines.push(line), config });
            process.exitCode = 0;
            return lines.join("\n");
        };

        // dry run: counts by push service, sends nothing, and never prints the secret endpoint URLs
        let webPush = fakeWebPush();
        let out = await run([], webPush, {});
        assert.equal(webPush.calls.length, 0);
        assert.ok(out.includes("3 push subscriptions: 2 on fcm.googleapis.com, 1 on web.push.apple.com"));
        assert.ok(out.includes("Dry run"));
        assert.ok(!out.includes("secret"));

        await assert.rejects(run(["--send"], fakeWebPush(), {}), /vapid/);
        await assert.rejects(run(["--sned"], fakeWebPush()), /Unknown option/);

        // sending: one subscription is gone, one fails, one works
        webPush = fakeWebPush({
            "https://web.push.apple.com/secret2": { statusCode: 410 },
            "https://fcm.googleapis.com/fcm/send/secret3": { statusCode: 500, body: "server error" },
        });
        out = await run(["--send"], webPush);
        assert.deepEqual(webPush.calls[0], { vapid: ["mailto:admin@example.com", "pub", "priv"] });
        const sends = webPush.calls.slice(1);
        assert.equal(sends.length, 3);
        assert.deepEqual(sends[0].subscription, { endpoint: "https://fcm.googleapis.com/fcm/send/secret1", keys: { p256dh: "key1", auth: "auth1" } });
        assert.equal(sends[0].payload, JSON.stringify({ type: "shutdown" }));
        assert.equal(sends[0].options.TTL, PUSH_TTL);
        // sent in endpoint order
        assert.deepEqual(sends.map(c => c.subscription.endpoint.slice(-7)), ["secret1", "secret3", "secret2"]);
        assert.ok(out.includes("sent   1/3 fcm.googleapis.com"));
        assert.ok(out.includes("FAIL   2/3 fcm.googleapis.com: HTTP 500 server error"));
        assert.ok(out.includes("gone   3/3 web.push.apple.com"));
        assert.ok(out.includes("Done. 1 sent, 1 no longer subscribed, 1 failed."));
        assert.ok(!out.includes("secret"));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log("Push shutdown tests passed");
})().catch(e => {
    console.error(e);
    process.exit(1);
});
