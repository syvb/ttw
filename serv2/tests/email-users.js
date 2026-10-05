// Tests for email-users.js. Run from the serv2 directory: `node tests/email-users.js`
// Nothing is actually sent: the Cloudflare API is replaced with a fake.

const assert = require("assert").strict;
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { findRecipients, parseTemplate, buildMessage, main } = require("../email-users.js");

const sql = name => fs.readFileSync(path.join(__dirname, "..", name), "utf-8");

function buildFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ttw-email-test-"));
    const userDbDir = path.join(dir, "user-dbs");
    fs.mkdirSync(userDbDir);
    const globalDb = new Database(path.join(dir, "global.db"));
    globalDb.exec(sql("initGlobalDb.sql"));
    const addUser = globalDb.prepare("INSERT INTO users (id, username, pw, register_date, plan) VALUES (?, ?, 'x', 0, 1)");
    const addEmail = globalDb.prepare("INSERT INTO emails (user_id, email, token, verified) VALUES (?, ?, 't', 0)");
    const users = [
        // id, username, email, pings (null = no database)
        [1, "alice", "alice@example.com", 3],
        [2, "bob", "bob@example.com", null],
        [3, "carol", "carol@example.com", 0],
        // two accounts with one address get one email
        [4, "dave", "Shared@example.com", 1],
        [5, "erin", "shared@example.com ", 2],
        // a duplicate username can't log in to the export server
        [36, "alice", "alice2@example.com", 1],
        [7, "frank", "not an email", 1],
    ];
    for (const [id, username, email, pings] of users) {
        addUser.run(id, username);
        addEmail.run(id, email);
        if (pings === null) continue;
        const userDb = new Database(path.join(userDbDir, `${id.toString(36)}.db`));
        userDb.exec(sql("initUserDb.sql"));
        for (let i = 0; i < pings; i++) {
            userDb.prepare("INSERT INTO pings (time, tags, interval, last_change) VALUES (?, 'a', 2700, 0)").run(1600000000 + i);
        }
        userDb.close();
    }
    // the same address stored twice for one account
    addEmail.run(1, "alice@example.com");
    globalDb.close();
    const template = path.join(dir, "template.txt");
    fs.writeFileSync(template, "Subject: Shut down\n\nHi {{usernames}},\n\nSee https://example.com/.\nBye\n");
    return { dir, userDbDir, globalDbPath: path.join(dir, "global.db"), template, sentLog: path.join(dir, "sent.log") };
}

// A fake Cloudflare API. `responses` is a list of [status, body] returned in order,
// then every later call succeeds.
function fakeApi(responses = []) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        const [status, body] = responses.shift() || [200, { success: true, errors: [], result: { delivered: ["x"], permanent_bounces: [], queued: [] } }];
        return { ok: status < 300, status, json: async () => body };
    };
    return { calls, fetchImpl };
}

async function run(f, extraArgs, api, env = { CF_API_TOKEN: "tok" }) {
    const lines = [];
    await main([
        "--template", f.template,
        "--global-db", f.globalDbPath, "--user-db-dir", f.userDbDir, "--sent-log", f.sentLog, "--delay", "0",
        ...extraArgs,
    ], { fetchImpl: api.fetchImpl, sleep: async () => {}, log: line => lines.push(line), env });
    return lines.join("\n");
}

async function main_() {
    const f = buildFixture();
    try {
        const { recipients, skipped } = findRecipients(f.globalDbPath, f.userDbDir);
        assert.deepEqual(recipients.map(r => [r.email, r.accounts.map(a => a.username)]), [
            ["alice@example.com", ["alice"]],
            ["Shared@example.com", ["dave", "erin"]],
            ["alice2@example.com", ["alice"]],
        ]);
        assert.equal(recipients[2].accounts[0].canLogIn, false);
        assert.equal(recipients[0].accounts[0].canLogIn, true);
        assert.deepEqual(skipped.map(s => [s.username, s.reason]), [
            ["bob", "no user database"],
            ["carol", "no pings"],
            ["frank", "invalid email address"],
        ]);

        const template = parseTemplate(fs.readFileSync(f.template, "utf-8"));
        assert.equal(template.subject, "Shut down");
        assert.throws(() => parseTemplate("no subject"));
        const message = buildMessage(template, recipients[1]);
        assert.equal(message.text, "Hi dave and erin,\n\nSee https://example.com/.\nBye\n");
        assert.equal(message.html, '<p>Hi dave and erin,</p>\n<p>See <a href="https://example.com/">https://example.com/</a>.<br>\nBye</p>');

        // dry run: no API calls, no credentials needed, nothing logged as sent
        let api = fakeApi();
        let out = await run(f, [], api, {});
        assert.equal(api.calls.length, 0);
        assert.ok(out.includes("Dry run"));
        assert.ok(out.includes("would  Shared@example.com: dave (1 pings), erin (2 pings)"));
        assert.ok(out.includes("duplicate username"));
        assert.ok(!fs.existsSync(f.sentLog));

        // test mode only sends to the test address
        api = fakeApi();
        await run(f, ["--test-to", "me@example.org"], api);
        assert.equal(api.calls.length, 1);
        assert.equal(api.calls[0].body.to, "me@example.org");
        assert.equal(api.calls[0].url, "https://api.cloudflare.com/client/v4/accounts/c84e7707c8cc68f8afb9bbe7dff97bf4/email/sending/send");
        assert.equal(api.calls[0].options.headers.Authorization, "Bearer tok");
        assert.ok(!fs.existsSync(f.sentLog));
        await assert.rejects(run(f, ["--test-to", "me@example.org", "--send"], fakeApi()));
        await assert.rejects(run(f, ["--send"], fakeApi(), { CF_API_TOKEN_FILE: path.join(f.dir, "missing") }), /CF_API_TOKEN/);

        // sending: the first address is rate limited once, then succeeds; the second fails for good
        api = fakeApi([
            [429, { success: false, errors: [{ code: 10004, message: "throttled" }] }],
            [200, { success: true, errors: [], result: { delivered: ["alice@example.com"], permanent_bounces: [], queued: [] } }],
            [400, { success: false, errors: [{ code: 10001, message: "bad" }] }],
            [200, { success: true, errors: [], result: { delivered: [], queued: [], permanent_bounces: [], suppressed_recipients: ["alice2@example.com"] } }],
        ]);
        out = await run(f, ["--send"], api);
        process.exitCode = 0;
        assert.deepEqual(api.calls.map(c => c.body.to), ["alice@example.com", "alice@example.com", "Shared@example.com", "alice2@example.com"]);
        assert.equal(api.calls[0].body.from, "TagTime Web <noreply@ttw.smitop.com>");
        assert.equal(api.calls[0].body.reply_to, "me@iter.ca");
        assert.equal(api.calls[0].body.subject, "Shut down");
        assert.ok(out.includes("FAIL   2/3 Shared@example.com: Sending failed: 10001: bad"));
        assert.ok(out.includes("suppr  3/3 alice2@example.com"));
        const logged = () => fs.readFileSync(f.sentLog, "utf-8").trim().split("\n").map(l => JSON.parse(l).email);
        assert.deepEqual(logged(), ["alice@example.com", "alice2@example.com"]);

        // rerunning only retries the failure
        api = fakeApi();
        await run(f, ["--send"], api);
        assert.deepEqual(api.calls.map(c => c.body.to), ["Shared@example.com"]);
        assert.deepEqual(logged(), ["alice@example.com", "alice2@example.com", "Shared@example.com"]);
    } finally {
        fs.rmSync(f.dir, { recursive: true, force: true });
    }
    console.log("Email script tests passed");
}

main_().catch(e => {
    console.error(e);
    process.exit(1);
});
