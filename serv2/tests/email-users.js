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
        [8, "gina", "gina@example.com", "corrupt"],
    ];
    for (const [id, username, email, pings] of users) {
        addUser.run(id, username);
        addEmail.run(id, email);
        if (pings === null) continue;
        if (pings === "corrupt") {
            fs.writeFileSync(path.join(userDbDir, `${id.toString(36)}.db`), "not a database");
            continue;
        }
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

// A fake Cloudflare API. `responses` is a list returned in order, then every
// later call succeeds. Each is [status, body], [status, "not json"] for a body
// that isn't JSON, or an Error to throw as if the network failed.
function fakeApi(responses = []) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        const response = responses.shift() || [200, { success: true, errors: [], result: { delivered: [JSON.parse(options.body).to], permanent_bounces: [], queued: [] } }];
        if (response instanceof Error) throw response;
        const [status, body] = response;
        return {
            ok: status < 300,
            status,
            json: async () => {
                if (body === "not json") throw new SyntaxError("Unexpected token");
                return body;
            },
        };
    };
    return { calls, fetchImpl };
}

async function run(f, extraArgs, api, { env = { CF_API_TOKEN: "tok" }, sentLog = f.sentLog } = {}) {
    const lines = [];
    await main([
        "--template", f.template,
        "--global-db", f.globalDbPath, "--user-db-dir", f.userDbDir, "--delay", "0",
        ...(sentLog ? ["--sent-log", sentLog] : []),
        ...extraArgs,
    ], { fetchImpl: api.fetchImpl, sleep: async () => {}, log: line => lines.push(line), env });
    process.exitCode = 0;
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
        assert.deepEqual(skipped.map(s => [s.username, s.reason.replace(/ \(.*/, "")]), [
            ["bob", "no user database"],
            ["carol", "no pings"],
            ["frank", "invalid email address"],
            ["gina", "unreadable user database"],
        ]);

        const template = parseTemplate(fs.readFileSync(f.template, "utf-8"));
        assert.equal(template.subject, "Shut down");
        assert.throws(() => parseTemplate("no subject"));
        const message = buildMessage(template, recipients[1]);
        assert.equal(message.text, "Hi dave and erin,\n\nSee https://example.com/.\nBye\n");
        assert.equal(message.html, '<p>Hi dave and erin,</p>\n<p>See <a href="https://example.com/">https://example.com/</a>.<br>\nBye</p>');
        const markdown = buildMessage({ subject: "s", body: "A **bold <b>** [link & text](https://example.com/a?b=1&c=2) (see: https://example.org/x).\n" }, recipients[0]);
        assert.equal(markdown.text, "A bold <b> link & text (https://example.com/a?b=1&c=2) (see: https://example.org/x).\n");
        assert.equal(markdown.html, '<p>A <strong>bold &lt;b&gt;</strong> <a href="https://example.com/a?b=1&amp;c=2">link &amp; text</a> (see: <a href="https://example.org/x">https://example.org/x</a>).</p>');
        // usernames are filled in as plain text, never as markup or replacement patterns
        const sneaky = buildMessage({ subject: "s", body: "Hi {{usernames}}\n" }, { accounts: [{ username: "**x** [y](https://e.com/) $& <i>" }] });
        assert.equal(sneaky.text, "Hi **x** [y](https://e.com/) $& <i>\n");
        assert.equal(sneaky.html, "<p>Hi **x** [y](https://e.com/) $&amp; &lt;i&gt;</p>");

        // dry run: no API calls, no credentials needed, nothing logged, and both versions shown
        let api = fakeApi();
        let out = await run(f, [], api, { env: {} });
        assert.equal(api.calls.length, 0);
        assert.ok(out.includes("Dry run"));
        assert.ok(out.includes("would  Shared@example.com: dave (1 pings), erin (2 pings)"));
        assert.ok(out.includes("duplicate username"));
        assert.ok(out.includes('HTML version:\n<p>Hi alice,</p>'));
        assert.ok(out.includes(`Sent log: ${f.sentLog} (0 addresses)`));
        assert.ok(!fs.existsSync(f.sentLog));
        // the sent log defaults to a fixed place, not the working directory
        out = await run(f, [], fakeApi(), { env: {}, sentLog: null });
        assert.ok(out.includes(`Sent log: ${path.join(__dirname, "..", "email-sent.log")} (`));

        // options are checked, so a typo can't silently drop the sent log
        await assert.rejects(run(f, ["--sentlog", "x"], fakeApi()), /Unknown option: --sentlog/);
        await assert.rejects(run(f, ["--delay", "soon"], fakeApi()), /--delay/);

        // test mode only sends to the test address
        api = fakeApi();
        await run(f, ["--test-to", "me@example.org"], api);
        assert.equal(api.calls.length, 1);
        assert.equal(api.calls[0].body.to, "me@example.org");
        assert.equal(api.calls[0].url, "https://api.cloudflare.com/client/v4/accounts/c84e7707c8cc68f8afb9bbe7dff97bf4/email/sending/send");
        assert.equal(api.calls[0].options.headers.Authorization, "Bearer tok");
        assert.ok(api.calls[0].options.signal, "requests have a timeout");
        assert.ok(!fs.existsSync(f.sentLog));
        await assert.rejects(run(f, ["--test-to", "me@example.org", "--send"], fakeApi()));
        await assert.rejects(run(f, ["--send"], fakeApi(), { env: { CF_API_TOKEN_FILE: path.join(f.dir, "missing") } }), /CF_API_TOKEN/);

        // alice is rate limited once and then sent; Shared is rejected; alice2 gets a
        // server error, which might have been sent, so it isn't retried
        api = fakeApi([
            [429, { success: false, errors: [{ code: 10004, message: "throttled" }] }],
            [200, { success: true, errors: [], result: { delivered: [], permanent_bounces: [], queued: ["ALICE@example.com"] } }],
            [400, { success: false, errors: [{ code: 10001, message: "bad" }] }],
            [502, "not json"],
        ]);
        out = await run(f, ["--send"], api);
        assert.deepEqual(api.calls.map(c => c.body.to), ["alice@example.com", "alice@example.com", "Shared@example.com", "alice2@example.com"]);
        assert.equal(api.calls[0].body.from, "TagTime Web <noreply@ttw.smitop.com>");
        assert.equal(api.calls[0].body.reply_to, "me@iter.ca");
        assert.equal(api.calls[0].body.subject, "Shut down");
        assert.ok(out.includes("sent   1/3 alice@example.com"));
        assert.ok(out.includes("FAIL   2/3 Shared@example.com: Sending failed: 10001: bad"));
        assert.ok(out.includes("UNSURE 3/3 alice2@example.com: Unclear whether it was sent: HTTP 502"));
        assert.ok(out.includes("Done. 1 sent, 1 failed, 1 unsure."));
        const logged = () => fs.readFileSync(f.sentLog, "utf-8").trim().split("\n").map(l => JSON.parse(l)).map(e => `${e.email} ${e.status}`);
        assert.deepEqual(logged(), [
            "alice@example.com attempt", "alice@example.com sent",
            "Shared@example.com attempt", "Shared@example.com failed",
            "alice2@example.com attempt", "alice2@example.com unknown",
        ]);

        // a rerun retries the rejection but not the unsure one; a network error is unsure too
        api = fakeApi([new Error("socket hang up")]);
        out = await run(f, ["--send"], api);
        assert.deepEqual(api.calls.map(c => c.body.to), ["Shared@example.com"]);
        assert.ok(out.includes("unsure alice2@example.com may already have been sent to; skipping"));
        assert.ok(out.includes("UNSURE 1/1 Shared@example.com: Request failed: socket hang up"));

        // nothing left that's safe to send
        api = fakeApi();
        out = await run(f, ["--send"], api);
        assert.equal(api.calls.length, 0);
        assert.ok(out.includes("3 addresses to email: 1 already sent, 2 unsure, 0 to send"));

        // --retry-unknown sends the unsure ones again; a result that doesn't name the address is flagged
        api = fakeApi([
            [200, { success: true, errors: [], result: {} }],
            [200, { success: true, errors: [], result: { delivered: [], queued: [], permanent_bounces: [], suppressed_recipients: ["alice2@example.com"] } }],
        ]);
        out = await run(f, ["--send", "--retry-unknown"], api);
        assert.deepEqual(api.calls.map(c => c.body.to), ["Shared@example.com", "alice2@example.com"]);
        assert.ok(out.includes("sent?  1/2 Shared@example.com (accepted, but the result doesn't mention this address"));
        assert.ok(out.includes("suppr  2/2 alice2@example.com"));
        api = fakeApi();
        await run(f, ["--send", "--retry-unknown"], api);
        assert.equal(api.calls.length, 0);

        // a run that stopped mid-send leaves an attempt with nothing after it, which counts as unsure
        const crashLog = path.join(f.dir, "crash.log");
        fs.writeFileSync(crashLog, '{"email":"alice@example.com","status":"sent"}\n{"email":"shared@example.com","status":"attempt"}\n');
        api = fakeApi();
        out = await run(f, ["--send"], api, { sentLog: crashLog });
        assert.deepEqual(api.calls.map(c => c.body.to), ["alice2@example.com"]);
        assert.ok(out.includes("unsure Shared@example.com may already have been sent to"));

        // a damaged sent log stops the run before anything is sent
        fs.writeFileSync(crashLog, '{"email":"alice@example.com","status":"sent"}\n{"email":\n');
        api = fakeApi();
        await assert.rejects(run(f, ["--send"], api, { sentLog: crashLog }), /line 2 isn't valid JSON/);
        assert.equal(api.calls.length, 0);
    } finally {
        fs.rmSync(f.dir, { recursive: true, force: true });
    }
    console.log("Email script tests passed");
}

main_().catch(e => {
    console.error(e);
    process.exit(1);
});
