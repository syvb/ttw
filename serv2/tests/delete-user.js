// Tests for delete-user.js. Run from the serv2 directory: `node tests/delete-user.js`
// Like the export server tests, this doesn't need config files.
// Some checks depend on whether this runs as root, which can write to read-only
// files, so it's worth running both as root and as a normal user.

const assert = require("assert").strict;
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const argon2 = require("argon2");
const Database = require("better-sqlite3");
const fetch = require("node-fetch");
const { createApp } = require("../export-server.js");
const { main, parseArgs, filterSentLog } = require("../delete-user.js");

const SECRET = "test-cookie-secret";
// Cheap hashing parameters so the tests run quickly. verify() reads them from the hash.
const FAST_ARGON2 = { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 };
const sql = name => fs.readFileSync(path.join(__dirname, "..", name), "utf-8");
const isRoot = process.getuid() === 0;

// Strings stored only for accounts that get deleted. None may be left in the
// databases afterwards.
const ALICE = {
    cookie: "1.alice-login-cookie",
    apiToken: "api!1.alice-api-token",
    // from a logout before the shutdown. The old server deleted it without
    // overwriting it, so a copy is still in auth.db's free space.
    loggedOut: "1.alice-logged-out-cookie",
    emailToken: "alice-email-verification-token",
};
const OTHER_SECRETS = ["2.bob-cookie", "4.dan-cookie", "5.erin-cookie", "6.gus-cookie", "api!6.gus-api-token",
    "bob@example.com", "dan@example.com", "Shared@Example.com", "gus@example.com"];

const SENT_LOG = [
    { email: "alice@example.com", status: "attempt" },
    { email: "alice@example.com", status: "sent", result: { delivered: ["alice@example.com"] } },
    // alice and erin both have this address
    { email: "Shared@example.com", status: "attempt" },
    { email: "Shared@example.com", status: "sent" },
    { email: "bob@example.com", status: "sent" },
    // contains alice's address, but isn't it
    { email: "malice@example.com", status: "sent" },
    // line 7: damaged, from a run that stopped mid-write
    '{"email":"ALICE@example.com","sta',
    { email: "gus@example.com", status: "sent" },
    '{"email":"zed@',
    { email: "zed@example.com", status: "sent" },
].map(entry => typeof entry === "string" ? entry : JSON.stringify({ ...entry, time: "2026-09-01T00:00:00.000Z" }));
const sentLogText = lines => lines.map(n => SENT_LOG[n - 1] + "\n").join("");

async function buildFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ttw-delete-test-"));
    const f = {
        dir,
        userDbDir: path.join(dir, "user-dbs"),
        globalDbPath: path.join(dir, "global.db"),
        authDbPath: path.join(dir, "auth.db"),
        sentLogPath: path.join(dir, "email-sent.log"),
    };
    fs.mkdirSync(f.userDbDir);

    const globalDb = new Database(f.globalDbPath);
    // like the old server, which didn't overwrite deleted rows
    globalDb.pragma("secure_delete = OFF");
    globalDb.exec(sql("initGlobalDb.sql"));
    const addUser = globalDb.prepare("INSERT INTO users (id, username, pw, register_date, plan) VALUES (?, ?, ?, ?, 1)");
    const addEmail = globalDb.prepare("INSERT INTO emails (user_id, email, token, verified) VALUES (?, ?, ?, 0)");
    f.aliceHash = await argon2.hash("alice password", FAST_ARGON2);
    addUser.run(1, "alice", f.aliceHash, Date.UTC(2020, 8, 13, 12));
    addEmail.run(1, "alice@example.com", ALICE.emailToken);
    addEmail.run(1, "shared@example.com", "t");
    // has no user database
    addUser.run(2, "bob", await argon2.hash("bob password", FAST_ARGON2), 0);
    addEmail.run(2, "bob@example.com", "t");
    // a duplicate username, which can't log in while #1 exists
    addUser.run(3, "alice", await argon2.hash("newer alice password", FAST_ARGON2), 0);
    // There's no account #4, but some of its data is left, as if the account
    // were deleted by hand with the sqlite3 command, which doesn't check foreign keys.
    globalDb.pragma("foreign_keys = OFF");
    addEmail.run(4, "dan@example.com", "t");
    // zed has this address too, so it can't pick an account
    addEmail.run(4, "zed@example.com", "t");
    globalDb.pragma("foreign_keys = ON");
    addUser.run(5, "erin", await argon2.hash("erin password", FAST_ARGON2), 0);
    addEmail.run(5, "Shared@Example.com ", "t");
    addUser.run(6, "gus", "gushash", 0);
    addEmail.run(6, "gus@example.com", "t");
    // the same address twice is still one account
    addEmail.run(6, "Gus@Example.com ", "t");
    // 36 is 10 in base 36, so this is 10.db. It's never deleted.
    addUser.run(36, "zed", "zedhash", 0);
    addEmail.run(36, "zed@example.com", "t");
    // a removed push subscription leaves free pages, which vacuuming clears
    globalDb.prepare("INSERT INTO pushregs (endpoint_uri, p256dh, auth, seed, alg, avg_interval) VALUES (?, 'k', 'a', 1, 1, 2700)")
        .run("https://push.example.com/" + "x".repeat(20000));
    globalDb.prepare("DELETE FROM pushregs").run();
    globalDb.close();

    const authDb = new Database(f.authDbPath);
    authDb.pragma("secure_delete = OFF");
    authDb.exec(sql("initAuthDb.sql"));
    const addToken = authDb.prepare("INSERT INTO tokens (user_id, token_data, created) VALUES (?, ?, 0)");
    // alice logs in, many others log in, then alice logs out. The copy of her
    // old cookie is on a page that deleting her current tokens doesn't touch.
    addToken.run(1, ALICE.loggedOut);
    for (let i = 0; i < 100; i++) addToken.run(1000 + i, `${1000 + i}.filler-${"f".repeat(200)}`);
    authDb.prepare("DELETE FROM tokens WHERE token_data = ?").run(ALICE.loggedOut);
    for (let i = 100; i < 200; i++) addToken.run(1000 + i, `${1000 + i}.filler-${"f".repeat(200)}`);
    addToken.run(1, ALICE.cookie);
    addToken.run(1, ALICE.apiToken);
    addToken.run(2, "2.bob-cookie");
    addToken.run(4, "4.dan-cookie");
    addToken.run(5, "5.erin-cookie");
    addToken.run(6, "6.gus-cookie");
    addToken.run(6, "api!6.gus-api-token");
    addToken.run(36, "api!36.zed-api-token");
    authDb.close();

    const addUserDb = (id, tags) => {
        const userDb = new Database(path.join(f.userDbDir, `${id.toString(36)}.db`));
        userDb.exec(sql("initUserDb.sql"));
        const addPing = userDb.prepare("INSERT INTO pings (time, tags, interval, last_change) VALUES (?, ?, 2700, 0)");
        tags.forEach((tag, i) => addPing.run(1600000000 + i * 2700, tag));
        userDb.close();
    };
    addUserDb(1, ["alice-private-tag", "work", ""]);
    addUserDb(4, ["dan-tag"]);
    // a journal left by an interrupted write, which makes 4.db unreadable read-only
    fs.writeFileSync(path.join(f.userDbDir, "4.db-journal"), "dan's leftover journal");
    addUserDb(5, ["erin-tag"]);
    addUserDb(6, ["gus-tag"]);
    addUserDb(36, ["zed-tag"]);

    fs.writeFileSync(f.sentLogPath, sentLogText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    fs.chmodSync(f.sentLogPath, 0o640);
    // with sudo, the sent log belongs to someone else, and must stay theirs
    if (isRoot) fs.chownSync(f.sentLogPath, 65534, 65534);

    // read-only, like after the shutdown steps
    for (const file of fs.readdirSync(f.userDbDir)) fs.chmodSync(path.join(f.userDbDir, file), 0o444);
    fs.chmodSync(f.userDbDir, 0o555);
    fs.chmodSync(f.globalDbPath, 0o444);
    fs.chmodSync(f.authDbPath, 0o444);
    return f;
}

function removeFixture(f) {
    fs.chmodSync(f.userDbDir, 0o755);
    fs.rmSync(f.dir, { recursive: true, force: true });
}

// The mode and sha256 of everything under dir, keyed by relative path
function snapshot(dir, prefix = "") {
    const out = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.join(prefix, entry.name);
        const mode = (fs.statSync(full).mode & 0o7777).toString(8);
        if (entry.isDirectory()) {
            out[rel + "/"] = mode;
            Object.assign(out, snapshot(full, rel));
        } else {
            out[rel] = `${mode} ${crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")}`;
        }
    }
    return out;
}

function query(file, statement, ...params) {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
        return db.prepare(statement).all(...params);
    } finally {
        db.close();
    }
}

function rows(f) {
    return {
        users: query(f.globalDbPath, "SELECT * FROM users ORDER BY id"),
        emails: query(f.globalDbPath, "SELECT * FROM emails ORDER BY id"),
        // tokens don't have a stable rowid, since vacuuming can renumber them
        tokens: query(f.authDbPath, "SELECT user_id, token_data, created FROM tokens ORDER BY token_data"),
    };
}

// A file's size as delete-user.js prints it, for files of a few KB.
const kb = file => `${(fs.statSync(file).size / 1024).toFixed(1)} KB`;

// Checks the strings appear nowhere in the files' bytes, including free space.
function assertNotInFiles(files, secrets) {
    for (const file of files) {
        const bytes = fs.readFileSync(file);
        for (const secret of secrets) assert(!bytes.includes(Buffer.from(secret)), `${secret} is still in ${file}`);
    }
}

function assertVacuumedAndIntact(f) {
    for (const file of [f.globalDbPath, f.authDbPath]) {
        assert.deepEqual(query(file, "PRAGMA integrity_check"), [{ integrity_check: "ok" }], file);
        assert.equal(query(file, "PRAGMA freelist_count")[0].freelist_count, 0, `${file} has free pages, so it wasn't vacuumed`);
    }
    // no journals or temporary files left behind
    assert.deepEqual(fs.readdirSync(f.dir).sort(), ["auth.db", "email-sent.log", "global.db", "user-dbs"]);
}

// Checks fn throws an error with exactly this message.
function assertThrowsMessage(fn, message) {
    assert.throws(fn, err => {
        assert.equal(err.message, message);
        return true;
    });
}

// main sets process.exitCode when it warns. Runs fn and returns the exit code
// it set, putting back the failure code that guards against a hanging test
// (see the bottom of the file).
function exitCodeOf(fn) {
    process.exitCode = 0;
    try {
        fn();
        return process.exitCode;
    } finally {
        process.exitCode = 1;
    }
}

// Runs delete-user.js's main with the fixture's paths. Returns the printed lines.
function run(f, argv, { authDbPath = f.authDbPath, timeout } = {}) {
    const lines = [];
    main([...argv,
        "--global-db", f.globalDbPath, "--auth-db", authDbPath, "--user-db-dir", f.userDbDir, "--sent-log", f.sentLogPath,
    ], { config: {}, log: line => lines.push(line), timeout });
    return lines;
}

function testParseArgs() {
    assert.deepEqual(parseArgs(["Alice"]), { username: "Alice" });
    assert.deepEqual(parseArgs(["--id", "036", "--delete"]), { id: 36, delete: true });
    assert.deepEqual(parseArgs(["zed", "--global-db", "g", "--auth-db", "a", "--user-db-dir", "u", "--sent-log", "s"]),
        { username: "zed", "global-db": "g", "auth-db": "a", "user-db-dir": "u", "sent-log": "s" });
    assert.deepEqual(parseArgs(["--email", " A@Example.com", "--delete"]), { email: " A@Example.com", delete: true });
    assert.throws(() => parseArgs([]), /^Error: Usage: node delete-user\.js <username>/);
    assert.throws(() => parseArgs(["alice", "--email", "a@example.com"]), /Usage/);
    assert.throws(() => parseArgs(["--id", "1", "--email", "a@example.com"]), /Usage/);
    assert.throws(() => parseArgs(["--email"]), /--email needs a value/);
    assert.throws(() => parseArgs(["--email", " "]), /--email needs an email address/);
    assert.throws(() => parseArgs(["--delete"]), /Usage/);
    assert.throws(() => parseArgs(["alice", "--id", "1"]), /Usage/);
    assert.throws(() => parseArgs(["alice", "bob"]), /Unexpected argument: bob/);
    assert.throws(() => parseArgs(["--id"]), /--id needs a value/);
    // a typo or a short option must never be taken as a username, or skip --delete's meaning
    assert.throws(() => parseArgs(["alice", "--delte"]), /Unknown option: --delte/);
    assert.throws(() => parseArgs(["alice", "-d"]), /Unknown option: -d/);
    for (const bad of ["1.5", "-1", "x", "", "1e3", "99999999999999999999", "--delete"]) {
        assert.throws(() => parseArgs(["--id", bad]), /--id must be a user ID/, bad);
    }
}

function testFilterSentLog() {
    const line = (email, extra = {}) => JSON.stringify({ email, status: "sent", ...extra });
    const text = [line(" ALICE@Example.com "), line("bob@example.com"), line("shared@example.com"), line("alice@example.com"), ""].join("\n");
    let result = filterSentLog(text, ["alice@example.com", "Shared@example.com"], new Set(["shared@example.com"]));
    assert.equal(result.text, [line("bob@example.com"), line("shared@example.com"), ""].join("\n"));
    assert.deepEqual([...result.removed], [["alice@example.com", 2]]);
    assert.deepEqual([...result.kept], [["shared@example.com", 1]]);
    assert.deepEqual(result.unreadable, []);

    // the trailing newline is kept even when the last entry goes, and blank lines stay
    result = filterSentLog(`${line("bob@example.com")}\n\n${line("alice@example.com")}\n`, ["alice@example.com"], new Set());
    assert.equal(result.text, `${line("bob@example.com")}\n\n`);
    assert.equal(filterSentLog(`${line("alice@example.com")}\n`, ["alice@example.com"], new Set()).text, "");
    assert.equal(filterSentLog("", ["alice@example.com"], new Set()).text, "");

    // lines that aren't entries stay, and are reported if they mention an address
    const odd = ["null", "[1]", '{"status":"sent","to":"alice@example.com"}', '{"email":"alice@exa', "{broken", '{"email":"bob@exa'].join("\n");
    result = filterSentLog(odd, ["alice@example.com"], new Set());
    assert.equal(result.text, odd);
    assert.deepEqual(result.unreadable, [3]);
    // a partial address isn't reported, and neither is everything when an address is blank
    assert.deepEqual(filterSentLog("{broken\n", ["", "  "], new Set()).unreadable, []);
}

async function testDeleteUser() {
    const f = await buildFixture();
    const app = createApp({
        cookieSecret: SECRET,
        globalDbPath: f.globalDbPath,
        authDbPath: f.authDbPath,
        userDbDir: f.userDbDir,
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
    const sessionOf = res => ({ headers: { Cookie: res.headers.raw()["set-cookie"][0].split(";")[0] } });
    const bearer = token => ({ headers: { Authorization: `Bearer ttwprivate_${token}` } });
    const aliceLegacy = { headers: { Cookie: `retag-auth=${ALICE.cookie}` } };
    const aliceApi = bearer(ALICE.apiToken);
    const zedApi = bearer("api!36.zed-api-token");
    const zedDb = fs.readFileSync(path.join(f.userDbDir, "10.db"));
    // the export server must keep working throughout, without logging errors
    const serverErrors = [];
    const realConsoleError = console.error;
    console.error = (...args) => serverErrors.push(args);

    try {
        // the fixture has what the tests need: a stale copy of a deleted token, and free pages
        assert(fs.readFileSync(f.authDbPath).includes(Buffer.from(ALICE.loggedOut)));
        assert.equal(query(f.authDbPath, "SELECT COUNT(*) AS n FROM tokens WHERE token_data = ?", ALICE.loggedOut)[0].n, 0);
        assert(query(f.globalDbPath, "PRAGMA freelist_count")[0].freelist_count > 0);

        // alice can get her data every way the export server allows
        const aliceLogin = await login("alice", "alice password");
        assert.equal(aliceLogin.status, 303);
        const aliceSession = sessionOf(aliceLogin);
        for (const auth of [aliceSession, aliceLegacy, aliceApi]) {
            const res = await req("/export/pings.json", auth);
            assert.equal(res.status, 200);
            assert.equal((await res.json()).pings[0].tags[0], "alice-private-tag");
        }
        assert.equal((await req("/db", aliceApi)).status, 200);

        const original = snapshot(f.dir);
        const originalRows = rows(f);

        // dry runs and refusals change nothing
        assert.throws(() => run(f, ["alice"]),
            /^Error: 2 accounts are named alice: #1, #3\. Pick one with --id\. Logging in as alice logs in to #1\.$/);
        assert.throws(() => run(f, ["alice", "--delete"]), /2 accounts are named alice/);
        assert.throws(() => run(f, ["nobody", "--delete"]), /^Error: No account is named nobody$/);
        // #4 has data but no account, so it can only be picked by user ID
        assert.throws(() => run(f, ["dan"]), /No account is named dan/);
        assert.throws(() => run(f, ["--id", "999", "--delete"]), /^Error: No data found for account #999$/);
        // an email address must belong to exactly one user ID, matched like the sent log
        for (const args of [["--email", "Shared@example.com"], ["--email", " SHARED@example.com ", "--delete"]]) {
            assertThrowsMessage(() => run(f, args),
                "2 accounts have the email address shared@example.com: #1 alice, #5 erin. Pick one with --id.");
        }
        // data left from a gone account counts, since deleting zed would leave the address there
        assertThrowsMessage(() => run(f, ["--email", "zed@example.com", "--delete"]),
            "2 accounts have the email address zed@example.com: #4 (no account left), #36 zed. Pick one with --id.");
        assertThrowsMessage(() => run(f, ["--email", "nobody@example.com", "--delete"]), "No account has the email address nobody@example.com");
        // only whole addresses match
        assertThrowsMessage(() => run(f, ["--email", "alice@example"]), "No account has the email address alice@example");
        assertThrowsMessage(() => run(f, ["--email", "lice@example.com"]), "No account has the email address lice@example.com");
        // a symlinked user database would leave the data it points to, so it's left for a person to deal with
        {
            const link = path.join(f.userDbDir, "a.db");
            fs.chmodSync(f.userDbDir, 0o755);
            fs.symlinkSync(path.join(f.userDbDir, "10.db"), link);
            try {
                assertThrowsMessage(() => run(f, ["--id", "10", "--delete"]),
                    `${link} is a symlink or something else that isn't a file, so deleting it might not delete the data. Delete it by hand.`);
            } finally {
                fs.unlinkSync(link);
                fs.chmodSync(f.userDbDir, 0o555);
            }
        }
        assert.throws(() => main(["zed", "--global-db", path.join(f.dir, "missing.db")], { config: {}, log: () => {} }),
            /missing\.db doesn't exist\. Run this from the serv2 directory, or use --global-db\./);
        assert(!fs.existsSync(path.join(f.dir, "missing.db")));
        // usernames are matched like logging in
        let out = run(f, [" ZED "]);
        assert.equal(out[0], "Account #36 zed, registered 1970-01-01. This deletes:");
        assert(out.includes(`  ${path.join(f.userDbDir, "10.db")}: 1 ping, ${kb(path.join(f.userDbDir, "10.db"))}`), out.join("\n"));

        const aliceDescription = [
            "Account #1 alice, registered 2020-09-13. This deletes:",
            `  ${f.globalDbPath}: the account (username and password hash), and 2 email addresses: alice@example.com, shared@example.com`,
            `  ${f.authDbPath}: 1 login cookie and 1 API token`,
            `  ${path.join(f.userDbDir, "1.db")}: 3 pings, ${kb(path.join(f.userDbDir, "1.db"))}`,
            `  ${f.sentLogPath}: 2 entries for alice@example.com`,
            `keep   ${f.sentLogPath}: 2 entries for shared@example.com, since #5 erin also has that address`,
            `warn   ${f.sentLogPath} line 7 isn't valid JSON, so it stays, but it mentions this account's email address. Check it by hand.`,
            "note   #3 is also named alice. Afterwards, logging in as alice logs in to #3.",
        ];
        out = run(f, ["--id", "1"]);
        assert.deepEqual(out, [
            ...aliceDescription,
            // only root can write to the read-only data
            ...(isRoot ? [] : [`note   --delete needs to write to ${f.globalDbPath}, ${f.authDbPath}, ${f.userDbDir} (directory), which you can't. Run it as root, such as with sudo.`]),
            "Dry run: nothing was deleted. Add --delete to delete it.",
        ]);
        // secrets are never printed
        for (const secret of [f.aliceHash, ...Object.values(ALICE)]) assert(!out.join("\n").includes(secret), secret);
        assert.deepEqual(run(f, ["--email", " ALICE@Example.com "]), out);
        assert.deepEqual(snapshot(f.dir), original);
        assert.deepEqual(rows(f), originalRows);

        if (!isRoot) {
            assertThrowsMessage(() => run(f, ["--id", "1", "--delete"]),
                `Nothing was deleted, since you can't write to ${f.globalDbPath}, ${f.authDbPath}, ${f.userDbDir} (directory). The shutdown steps make the data read-only, so run this as root, such as with sudo.`);
            assert.deepEqual(snapshot(f.dir), original);
            // the other way to allow it
            for (const target of [f.globalDbPath, f.authDbPath]) fs.chmodSync(target, 0o644);
            fs.chmodSync(f.userDbDir, 0o755);
        }
        const modes = snapshot(f.dir);
        const inodes = [f.globalDbPath, f.authDbPath].map(file => fs.statSync(file).ino);

        // If another program is writing to global.db, nothing changes, not even
        // in auth.db, which is deleted from first, or in the files.
        {
            const writer = new Database(f.globalDbPath);
            writer.prepare("BEGIN IMMEDIATE").run();
            try {
                assert.throws(() => run(f, ["--id", "1", "--delete"], { timeout: 100 }), /database is locked/);
            } finally {
                writer.prepare("ROLLBACK").run();
                writer.close();
            }
            assert.deepEqual(snapshot(f.dir), modes);
            assert.deepEqual(rows(f), originalRows);
        }

        // delete alice while the export server is running
        assert.equal(exitCodeOf(() => { out = run(f, ["--id", "1", "--delete"]); }), 0);
        assert.deepEqual(out, [
            ...aliceDescription,
            "Deleted account #1 alice.",
            "Backups made before now, such as the one from the shutdown steps, still have its data.",
        ]);

        // the running export server stops letting her in, in every way
        {
            const home = await (await req("/", aliceSession)).text();
            assert(!home.includes("logged in as"));
            assert(home.includes('action="/login"'));
            for (const auth of [aliceSession, aliceLegacy, aliceApi]) {
                for (const target of ["/export/pings.json", "/export/tags.log", "/export/user.db"]) {
                    assert.equal((await req(target, auth)).status, 403, target);
                }
            }
            assert.equal((await req("/db", aliceApi)).status, 403);
            const res = await login("alice", "alice password");
            assert.equal(res.status, 200);
            assert((await res.text()).includes("Incorrect username or password."));
            // the duplicate account gets the username, without alice's data
            const dupe = await login("alice", "newer alice password");
            assert.equal(dupe.status, 303);
            assert((await (await req("/", sessionOf(dupe))).text()).includes("logged in as <strong>alice</strong>"));
            assert.equal((await req("/export/pings.json", sessionOf(dupe))).status, 404);
        }
        // and keeps working for everyone else
        {
            const res = await req("/export/user.db", zedApi);
            assert.equal(res.status, 200);
            assert((await res.buffer()).equals(zedDb));
            const erin = await login("erin", "erin password");
            assert.equal(erin.status, 303);
            assert.equal((await (await req("/export/pings.json", sessionOf(erin))).json()).pings[0].tags[0], "erin-tag");
        }

        // exactly alice's data is gone
        const notAlice = {
            users: originalRows.users.filter(row => row.id !== 1),
            emails: originalRows.emails.filter(row => row.user_id !== 1),
            tokens: originalRows.tokens.filter(row => row.user_id !== 1),
        };
        assert.deepEqual(rows(f), notAlice);
        // The databases were rewritten in place rather than replaced, so with sudo
        // they still belong to whoever owned them.
        assert.deepEqual([f.globalDbPath, f.authDbPath].map(file => fs.statSync(file).ino), inodes);
        // the files that changed kept their modes, and the rest are the same except for 1.db
        const now = snapshot(f.dir);
        const changed = ["global.db", "auth.db", "email-sent.log"];
        for (const file of changed) assert.equal(now[file].split(" ")[0], modes[file].split(" ")[0], file);
        const unchanged = files => Object.fromEntries(Object.entries(files).filter(([file]) => !changed.includes(file)));
        const expected = unchanged(modes);
        delete expected[path.join("user-dbs", "1.db")];
        assert.deepEqual(unchanged(now), expected);
        assert.equal(fs.readFileSync(f.sentLogPath, "utf-8"), sentLogText([3, 4, 5, 6, 7, 8, 9, 10]));
        assert.equal(fs.statSync(f.sentLogPath).uid, isRoot ? 65534 : process.getuid());
        assert.equal(fs.statSync(f.sentLogPath).gid, isRoot ? 65534 : process.getgid());
        // nothing of alice's is left in the databases' bytes, including the old logged-out cookie
        assertNotInFiles([f.globalDbPath, f.authDbPath], [
            f.aliceHash, ...Object.values(ALICE), "alice@example.com", "shared@example.com",
        ]);
        assertVacuumedAndIntact(f);

        // with alice gone, the address she shared is only erin's
        assert.equal(run(f, ["--email", "shared@example.com"])[0], "Account #5 erin, registered 1970-01-01. This deletes:");
        assertThrowsMessage(() => run(f, ["--email", "alice@example.com"]), "No account has the email address alice@example.com");

        // running it again finds nothing
        const afterAlice = snapshot(f.dir);
        assert.throws(() => run(f, ["--id", "1", "--delete"]), /^Error: No data found for account #1$/);
        assert.deepEqual(snapshot(f.dir), afterAlice);

        // data left from an account that's already gone, including a journal next to its user database
        out = run(f, ["--id", "4"]);
        assert.deepEqual(out, [
            "There's no account #4, but some of its data is left. This deletes:",
            `  ${f.globalDbPath}: 2 email addresses: dan@example.com, zed@example.com`,
            `  ${f.authDbPath}: 1 login cookie`,
            `  ${path.join(f.userDbDir, "4.db")}: ${kb(path.join(f.userDbDir, "4.db"))}, which can't be read (attempt to write a readonly database)`,
            `  ${path.join(f.userDbDir, "4.db-journal")}: 22 bytes`,
            `keep   ${f.sentLogPath}: 1 entry for zed@example.com, since #36 zed also has that address`,
            "Dry run: nothing was deleted. Add --delete to delete it.",
        ]);
        // it can be found by an address only it has
        assert.deepEqual(run(f, ["--email", "DAN@example.com"]), out);
        assert.deepEqual(snapshot(f.dir), afterAlice);
        out = run(f, ["--id", "4", "--delete"]);
        assert.equal(out[out.length - 2], "Deleted the data left from account #4.");
        assert(!fs.existsSync(path.join(f.userDbDir, "4.db")));
        assert(!fs.existsSync(path.join(f.userDbDir, "4.db-journal")));
        assert.equal(query(f.globalDbPath, "SELECT COUNT(*) AS n FROM emails WHERE user_id = 4")[0].n, 0);
        assert.equal(query(f.authDbPath, "SELECT COUNT(*) AS n FROM tokens WHERE user_id = 4")[0].n, 0);

        // without auth.db, which the export server allows, tokens are skipped and the file isn't created
        {
            const missing = path.join(f.dir, "missing-auth.db");
            out = run(f, ["bob", "--delete"], { authDbPath: missing });
            assert.deepEqual(out, [
                "Account #2 bob, registered 1970-01-01. This deletes:",
                `  ${f.globalDbPath}: the account (username and password hash), and 1 email address: bob@example.com`,
                `  ${f.sentLogPath}: 1 entry for bob@example.com`,
                `note   ${missing} doesn't exist, so there are no tokens to delete`,
                `note   no user database at ${path.join(f.userDbDir, "2.db")}`,
                "Deleted account #2 bob.",
                "Backups made before now, such as the one from the shutdown steps, still have its data.",
            ]);
            assert(!fs.existsSync(missing));
            assert.deepEqual(query(f.authDbPath, "SELECT token_data FROM tokens WHERE user_id = 2"), [{ token_data: "2.bob-cookie" }]);
            assert.equal(fs.readFileSync(f.sentLogPath, "utf-8"), sentLogText([3, 4, 6, 7, 8, 9, 10]));
        }

        // A failure to vacuum is reported, after the data is deleted. Here it
        // deletes bob's token, which was left since auth.db wasn't used above.
        {
            const realExec = Database.prototype.exec;
            Database.prototype.exec = function (source) {
                if (source === "VACUUM auth") throw new Error("disk I/O error");
                return realExec.call(this, source);
            };
            let exitCode;
            try {
                exitCode = exitCodeOf(() => { out = run(f, ["--id", "2", "--delete"]); });
            } finally {
                Database.prototype.exec = realExec;
            }
            assert.deepEqual(out, [
                "There's no account #2, but some of its data is left. This deletes:",
                `  ${f.authDbPath}: 1 login cookie`,
                `note   no user database at ${path.join(f.userDbDir, "2.db")}`,
                "Deleted the data left from account #2.",
                `WARN   Couldn't vacuum ${f.authDbPath}: disk I/O error. The account is deleted, but data deleted before now, such as old login cookies, can stay in its free space until it's vacuumed, such as with sqlite3 ${f.authDbPath} VACUUM.`,
                "Backups made before now, such as the one from the shutdown steps, still have its data.",
            ]);
            assert.equal(exitCode, 1);
            assert.equal(query(f.authDbPath, "SELECT COUNT(*) AS n FROM tokens WHERE user_id = 2")[0].n, 0);
            // the token was still overwritten when it was deleted
            assertNotInFiles([f.authDbPath], ["2.bob-cookie"]);
        }

        // If committing fails, here since a reader holds global.db too long, the
        // account stays even though its files are gone, so running it again finishes.
        {
            const reader = new Database(f.globalDbPath, { readonly: true });
            reader.prepare("BEGIN").run();
            reader.prepare("SELECT COUNT(*) FROM users").get();
            try {
                assert.throws(() => run(f, ["gus", "--delete"], { timeout: 100 }), /database is locked/);
            } finally {
                reader.prepare("COMMIT").run();
                reader.close();
            }
            assert.equal(query(f.globalDbPath, "SELECT COUNT(*) AS n FROM users WHERE id = 6")[0].n, 1);
            assert.equal(query(f.authDbPath, "SELECT COUNT(*) AS n FROM tokens WHERE user_id = 6")[0].n, 2);
            assert(!fs.existsSync(path.join(f.userDbDir, "6.db")));
            assert.equal(fs.readFileSync(f.sentLogPath, "utf-8"), sentLogText([3, 4, 6, 7, 9, 10]));
            out = run(f, ["--email", "gus@example.com", "--delete"]);
            assert.deepEqual(out.slice(0, 4), [
                "Account #6 gus, registered 1970-01-01. This deletes:",
                `  ${f.globalDbPath}: the account (username and password hash), and 2 email addresses: gus@example.com, Gus@Example.com`,
                `  ${f.authDbPath}: 1 login cookie and 1 API token`,
                `note   no user database at ${path.join(f.userDbDir, "6.db")}`,
            ]);
            assert.equal(out[4], "Deleted account #6 gus.");
            assert.equal(query(f.globalDbPath, "SELECT COUNT(*) AS n FROM users WHERE id = 6")[0].n, 0);
        }

        // From the command line, with global.db and auth.db found in the working
        // directory like the export server does. With alice gone, erin's shared
        // address is only hers, so its sent log entries go too.
        {
            const cli = (args, cwd = f.dir) => spawnSync(process.execPath, [path.join(__dirname, "..", "delete-user.js"), ...args], { cwd, encoding: "utf-8" });
            const realDir = fs.realpathSync(f.dir);
            const paths = ["--user-db-dir", f.userDbDir, "--sent-log", f.sentLogPath];
            let res = cli(["erin", ...paths]);
            assert.equal(res.status, 0, res.stderr);
            assert.equal(res.stderr, "");
            assert.equal(res.stdout, [
                "Account #5 erin, registered 1970-01-01. This deletes:",
                `  ${path.join(realDir, "global.db")}: the account (username and password hash), and 1 email address: Shared@Example.com`,
                `  ${path.join(realDir, "auth.db")}: 1 login cookie`,
                `  ${path.join(f.userDbDir, "5.db")}: 1 ping, ${kb(path.join(f.userDbDir, "5.db"))}`,
                `  ${f.sentLogPath}: 2 entries for shared@example.com`,
                "Dry run: nothing was deleted. Add --delete to delete it.",
                "",
            ].join("\n"));

            res = cli(["erin", "--delte", ...paths]);
            assert.equal(res.status, 1);
            assert.equal(res.stdout, "");
            assert.equal(res.stderr, "Unknown option: --delte\n");
            res = cli(["erin", ...paths], os.tmpdir());
            assert.equal(res.status, 1);
            assert.equal(res.stderr, `${path.join(fs.realpathSync(os.tmpdir()), "global.db")} doesn't exist. Run this from the serv2 directory, or use --global-db.\n`);

            res = cli(["erin", "--delete", ...paths]);
            assert.equal(res.status, 0, res.stderr);
            assert(res.stdout.includes("\nDeleted account #5 erin.\n"));
            assert.equal(fs.readFileSync(f.sentLogPath, "utf-8"), sentLogText([6, 7, 9, 10]));
            const erin = await login("erin", "erin password");
            assert.equal(erin.status, 200);
            assert((await erin.text()).includes("Incorrect username or password."));
        }

        // Only the duplicate alice and zed are left, with zed's data unchanged
        // and still available.
        const kept = [3, 36];
        assert.deepEqual(rows(f), {
            users: originalRows.users.filter(row => kept.includes(row.id)),
            emails: originalRows.emails.filter(row => kept.includes(row.user_id)),
            tokens: originalRows.tokens.filter(row => kept.includes(row.user_id) || row.user_id >= 1000),
        });
        assert.deepEqual(fs.readdirSync(f.userDbDir), ["10.db"]);
        assert(fs.readFileSync(path.join(f.userDbDir, "10.db")).equals(zedDb));
        assert((await (await req("/export/user.db", zedApi)).buffer()).equals(zedDb));
        assertNotInFiles([f.globalDbPath, f.authDbPath], [f.aliceHash, ...Object.values(ALICE), ...OTHER_SECRETS]);
        assertVacuumedAndIntact(f);
        assert.equal(snapshot(f.dir)["user-dbs/"], modes["user-dbs/"]);
    } finally {
        console.error = realConsoleError;
        server.close();
        removeFixture(f);
    }
    assert.deepEqual(serverErrors, []);
}

// A journal left by an interrupted write to global.db stops read-only
// connections, so the error says how to fix it.
async function testInterruptedWrite() {
    const f = await buildFixture();
    try {
        fs.writeFileSync(f.globalDbPath + "-journal", "left over");
        const before = snapshot(f.dir);
        assertThrowsMessage(() => run(f, ["zed"]),
            `${f.globalDbPath} has a journal left from an interrupted write, so it can't be read until it's rolled back. Run sqlite3 ${f.globalDbPath} "PRAGMA quick_check" as root, then try again.`);
        assert.deepEqual(snapshot(f.dir), before);
    } finally {
        removeFixture(f);
    }
}

// If a test leaves a promise hanging, Node exits once nothing is left to run.
// Treat that as a failure rather than a silent success.
process.exitCode = 1;
(async () => {
    testParseArgs();
    testFilterSentLog();
    await testDeleteUser();
    await testInterruptedWrite();
    console.log(`Account deletion tests passed (as ${isRoot ? "root" : "a normal user"})`);
    process.exitCode = 0;
})().catch(e => {
    console.error(e);
    process.exit(1);
});
