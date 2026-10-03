// Read-only data export server for a shut-down instance.
//
// This replaces both the frontend and the main backend (index.js). It lets
// existing users log in with their old username and password and download
// their data, and nothing else. It never writes to any database.
//
// Usage (from the serv2 directory): `node export-server.js`
// See docs/shutdown.md for how to deploy it.

"use strict";

const express = require("express");
const Database = require("better-sqlite3");
const argon2 = require("argon2");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const SESSION_COOKIE = "ttw-export";
const LEGACY_COOKIE = "retag-auth";
const SESSION_LENGTH_MS = 86400000; // 1 day
// Old password hashes use ~500 MB of memory per verify, so verify one at a time
// and turn away logins once this many are waiting.
const MAX_PENDING_LOGINS = 8;

const STYLE = `
:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fdfdfc; --muted: #5f6368; --line: #d6d6d3; --accent: #1a5fb4; --err-bg: #fde8e8; --err-fg: #8a1c1c; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8e8e6; --bg: #18181a; --muted: #a3a3a8; --line: #3a3a3e; --accent: #8ab4f8; --err-bg: #3d1d1d; --err-fg: #f6b2b2; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 2rem 1rem; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 36rem; margin: 0 auto; }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 1rem; }
h2 { font-size: 1.1rem; margin: 2rem 0 0.75rem; }
a { color: var(--accent); }
p, ul { margin: 0 0 1rem; }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
input[type=text], input[type=password] { width: 100%; max-width: 20rem; padding: 0.5rem; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 6px; }
button { font: inherit; padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--bg); cursor: pointer; }
button.secondary { background: transparent; color: var(--accent); }
.field { margin-bottom: 1rem; }
.error { background: var(--err-bg); color: var(--err-fg); padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
.downloads { list-style: none; padding: 0; }
.downloads li { border-top: 1px solid var(--line); padding: 1rem 0; }
.downloads li:last-child { border-bottom: 1px solid var(--line); }
.downloads form { margin: 0 0 0.25rem; }
.note { color: var(--muted); font-size: 0.9rem; margin: 0; }
footer { margin-top: 2.5rem; color: var(--muted); font-size: 0.9rem; }
`;

// Fills in the browser's time zone for the TagTime log download.
// Without JavaScript the log is written in UTC.
const TZ_SCRIPT = `try {
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
        document.getElementById("tz").value = zone;
        document.getElementById("tz-name").textContent = zone;
    }
} catch (e) {}`;

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

function cspHash(source) {
    return "'sha256-" + crypto.createHash("sha256").update(source, "utf8").digest("base64") + "'";
}

const CSP = [
    "default-src 'none'",
    `style-src ${cspHash(STYLE)}`,
    `script-src ${cspHash(TZ_SCRIPT)}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
].join("; ");

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

class QueueFullError extends Error {}

// Runs async tasks one at a time. Rejects with QueueFullError instead of
// queueing when maxPending tasks are already running or waiting.
function createSerialQueue(maxPending) {
    let tail = Promise.resolve();
    let pending = 0;
    return function run(task) {
        if (pending >= maxPending) return Promise.reject(new QueueFullError("Too many pending tasks"));
        pending++;
        const result = tail.then(() => task());
        tail = result.catch(() => {}).then(() => { pending--; });
        return result;
    };
}

// Returns a function that formats a ping as a line of a TagTime log. This
// matches the export in the old app's settings page, with the bracketed
// human-readable date written in the given time zone.
function tagtimeLineFormatter(timeZone) {
    const format = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        weekday: "short",
    });
    return ping => {
        let line = `${ping.time} ${ping.tags.join(" ")}`;
        line += " ".repeat(Math.max(1, 54 - line.length));
        const parts = Object.create(null);
        for (const part of format.formatToParts(new Date(ping.time * 1000))) {
            parts[part.type] = part.value;
        }
        line += `[${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.weekday.toUpperCase()}]`;
        return line;
    };
}

function isValidTimeZone(timeZone) {
    if (timeZone.length > 100) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch (e) {
        return false;
    }
}

// Wraps an async route handler so errors reach Express's error handler.
function wrap(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Creates the export app. Options:
 * - cookieSecret (required): secret used to sign session cookies
 * - globalDbPath (required): path to global.db (usernames and password hashes)
 * - userDbDir (required): directory holding each user's <id in base 36>.db
 * - authDbPath: path to auth.db; when given, old login cookies and API tokens keep working
 * - appName, contactEmail, deletionDate: shown on the page
 * - extraHtml: raw HTML shown under the shutdown notice
 * - secureCookie: set the Secure flag on the session cookie
 * - legacyCookieDomain: the old `cookie-domain`, needed to clear old login cookies on logout
 */
function createApp(options) {
    if (!options.cookieSecret) throw new Error("cookieSecret is required");
    const appName = options.appName || "TagTime Web";
    const userDbDir = options.userDbDir;
    if (!fs.statSync(userDbDir).isDirectory()) throw new Error(`${userDbDir} is not a directory`);

    const readOnly = { readonly: true, fileMustExist: true };
    const globalDb = new Database(options.globalDbPath, readOnly);
    const authDb = options.authDbPath ? new Database(options.authDbPath, readOnly) : null;
    const stmts = {
        // it used to be possible to register multiple accounts with the same name
        login: globalDb.prepare("SELECT id, pw FROM users WHERE username = ? ORDER BY id LIMIT 1"),
        username: globalDb.prepare("SELECT username FROM users WHERE id = ?"),
        token: authDb && authDb.prepare("SELECT user_id FROM tokens WHERE token_data = ?"),
    };
    const verifyQueue = createSerialQueue(MAX_PENDING_LOGINS);

    function userDbPath(uid) {
        return path.join(userDbDir, `${uid.toString(36)}.db`);
    }

    function lookupToken(token) {
        if (!stmts.token || typeof token !== "string" || token.length === 0) return null;
        const row = stmts.token.get(token);
        return row ? row.user_id : null;
    }

    function sessionUser(req) {
        const value = req.signedCookies[SESSION_COOKIE];
        if (typeof value !== "string") return null;
        const match = value.match(/^(\d+)\.(\d+)$/);
        if (!match || Number(match[2]) < Date.now()) return null;
        return Number(match[1]);
    }

    // Sets req.user to { id, username } or null.
    function authenticate(req, res, next) {
        let uid = null;
        const authHeader = req.header("Authorization");
        if (authHeader) {
            const match = authHeader.match(/^Bearer ttwprivate_(.+)$/);
            uid = match ? lookupToken(match[1]) : null;
        } else {
            uid = sessionUser(req);
            if (uid === null) uid = lookupToken(req.cookies[LEGACY_COOKIE]);
        }
        const row = uid === null ? undefined : stmts.username.get(uid);
        req.user = row ? { id: uid, username: row.username } : null;
        next();
    }

    function requireUser(req, res, next) {
        if (req.user) return next();
        res.status(403).send(page("Not logged in", `<h1>Not logged in</h1><p><a href="/">Log in</a> to download your data.</p>`));
    }

    function page(title, body) {
        const contact = options.contactEmail
            ? `<footer>Questions? Contact <a href="mailto:${escapeHtml(options.contactEmail)}">${escapeHtml(options.contactEmail)}</a>.</footer>`
            : "";
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
${contact}
</main>
</body>
</html>
`;
    }

    function homePage(user, error) {
        const deletion = options.deletionDate
            ? ` All data will be permanently deleted on ${escapeHtml(options.deletionDate)}.`
            : "";
        let body = `<h1>${escapeHtml(appName)} has shut down</h1>
<p>${escapeHtml(appName)} is no longer running. You can still log in to download your data.${deletion}</p>
${options.extraHtml || ""}`;
        if (user) {
            body += `<h2>Your data</h2>
<p>You are logged in as <strong>${escapeHtml(user.username)}</strong>.</p>
<ul class="downloads">
<li>
<form method="get" action="/export/tags.log">
<input type="hidden" name="tz" id="tz" value="UTC">
<button type="submit">Download TagTime log</button>
</form>
<p class="note">Works with TagTime and tools that read TagTime logs. Dates in brackets use the <span id="tz-name">UTC</span> time zone.</p>
</li>
<li>
<form method="get" action="/export/pings.json"><button type="submit">Download JSON</button></form>
<p class="note">Every ping with its tags, plus your settings.</p>
</li>
<li>
<form method="get" action="/export/user.db"><button type="submit">Download SQLite database</button></form>
<p class="note">A complete copy of your account data.</p>
</li>
</ul>
<form method="post" action="/logout"><button type="submit" class="secondary">Log out</button></form>
<script>${TZ_SCRIPT}</script>`;
        } else {
            body += `<h2>Log in</h2>
${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
<form method="post" action="/login">
<div class="field">
<label for="username">Username</label>
<input type="text" id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
</div>
<div class="field">
<label for="pw">Password</label>
<input type="password" id="pw" name="pw" autocomplete="current-password" required>
</div>
<button type="submit">Log in</button>
</form>`;
        }
        return page(`${appName} has shut down`, body);
    }

    function sendNoData(res) {
        res.status(404).send(page("No data", `<h1>No data found</h1><p>There is no saved data for this account.</p>`));
    }

    function openUserDb(req, res) {
        const file = userDbPath(req.user.id);
        if (!fs.existsSync(file)) {
            sendNoData(res);
            return null;
        }
        return new Database(file, readOnly);
    }

    function readPings(db) {
        return db.prepare("SELECT time, tags, interval, category, comment, last_change FROM pings ORDER BY time")
            .all()
            .map(row => ({ ...row, tags: row.tags.length === 0 ? [] : row.tags.split(" ") }));
    }

    function readConfig(db) {
        const config = {};
        for (const { k, v } of db.prepare("SELECT k, v FROM meta").all()) config[k] = v;
        return config;
    }

    function sendDb(req, res) {
        const file = userDbPath(req.user.id);
        let size;
        try {
            size = fs.statSync(file).size;
        } catch (e) {
            if (e.code === "ENOENT") return sendNoData(res);
            throw e;
        }
        res.attachment(req.path === "/db" ? "user.db" : `${req.user.username}.db`);
        res.type("application/vnd.sqlite3");
        res.set("Content-Length", String(size));
        fs.createReadStream(file).on("error", err => res.destroy(err)).pipe(res);
    }

    const app = express();
    app.disable("x-powered-by");
    app.set("query parser", "simple");
    app.use(cookieParser(options.cookieSecret));
    app.use((req, res, next) => {
        res.set({
            "Content-Security-Policy": CSP,
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
        });
        next();
    });

    // Replaces the old app's service worker so installed copies of the app go away.
    app.get("/sw.js", (req, res) => {
        res.type("text/javascript");
        res.set("Cache-Control", "no-cache");
        res.send(SW_SCRIPT);
    });

    app.get("/", authenticate, (req, res) => {
        res.send(homePage(req.user, null));
    });

    app.post("/login", express.urlencoded({ extended: false, limit: "20kb" }), wrap(async (req, res) => {
        const fail = (message, status = 200) => res.status(status).send(homePage(null, message));
        const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
        const pw = typeof req.body.pw === "string" ? req.body.pw : "";
        if (!/^[a-z]{1,15}$/.test(username) || pw.length === 0 || pw.length > 10000) {
            return fail("Incorrect username or password.");
        }
        const row = stmts.login.get(username);
        if (!row) return fail("Incorrect username or password.");
        let valid;
        try {
            valid = await verifyQueue(() => argon2.verify(row.pw, pw));
        } catch (e) {
            if (e instanceof QueueFullError) return fail("The server is busy. Please try again in a minute.", 503);
            throw e;
        }
        if (!valid) return fail("Incorrect username or password.");
        res.cookie(SESSION_COOKIE, `${row.id}.${Date.now() + SESSION_LENGTH_MS}`, {
            signed: true,
            httpOnly: true,
            secure: !!options.secureCookie,
            sameSite: "lax",
            maxAge: SESSION_LENGTH_MS,
        });
        res.redirect(303, "/");
    }));

    app.post("/logout", (req, res) => {
        res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: !!options.secureCookie, sameSite: "lax" });
        res.clearCookie(LEGACY_COOKIE, options.legacyCookieDomain ? { domain: options.legacyCookieDomain } : {});
        res.redirect(303, "/");
    });

    app.get("/export/user.db", authenticate, requireUser, sendDb);
    // The old API's database download, so scripts using API tokens keep working.
    app.get("/db", authenticate, requireUser, sendDb);

    app.get("/export/pings.json", authenticate, requireUser, (req, res) => {
        const db = openUserDb(req, res);
        if (!db) return;
        try {
            const data = { username: req.user.username, pings: readPings(db), config: readConfig(db) };
            res.attachment(`${req.user.username}-pings.json`);
            res.type("application/json");
            res.send(JSON.stringify(data, null, 2) + "\n");
        } finally {
            db.close();
        }
    });

    app.get("/export/tags.log", authenticate, requireUser, (req, res) => {
        const timeZone = typeof req.query.tz === "string" && req.query.tz !== "" ? req.query.tz : "UTC";
        if (!isValidTimeZone(timeZone)) {
            return res.status(400).type("text/plain").send(`Unknown time zone: ${timeZone}\n`);
        }
        const db = openUserDb(req, res);
        if (!db) return;
        try {
            const formatLine = tagtimeLineFormatter(timeZone);
            const lines = readPings(db).map(formatLine);
            res.attachment(`${req.user.username}-tags.log`);
            res.type("text/plain");
            // all files should end with a trailing newline
            res.send(lines.map(line => line + "\n").join(""));
        } finally {
            db.close();
        }
    });

    // Everything else belonged to the old app or API. Send browsers to the
    // shutdown page, and tell API clients the endpoint is gone.
    app.use((req, res) => {
        if ((req.method === "GET" || req.method === "HEAD") && !req.header("Authorization")) {
            return res.redirect(302, "/");
        }
        res.status(410).type("text/plain").send(`${appName} has shut down. Data downloads are available at /.\n`);
    });

    app.use((err, req, res, next) => {
        console.error(err);
        if (res.headersSent) return res.destroy();
        res.status(500).send(page("Error", `<h1>Something went wrong</h1><p><a href="/">Go back</a> and try again.</p>`));
    });

    return app;
}

function loadConfig() {
    const root = path.join(__dirname, "..");
    const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf-8"));
    return { ...read("config.json"), ...read("config-private.json") };
}

function main() {
    const config = loadConfig();
    // index.js opens these relative to the working directory, so do the same.
    const authDbPath = config["auth-db"] || path.resolve("auth.db");
    const app = createApp({
        cookieSecret: config["cookie-secret"],
        globalDbPath: config["global-db"] || path.resolve("global.db"),
        authDbPath: fs.existsSync(authDbPath) ? authDbPath : null,
        userDbDir: config["user-db-dir"] || path.join(__dirname, "user-dbs"),
        appName: config["app-name"],
        contactEmail: config["contact-email"],
        deletionDate: config["export-deletion-date"],
        extraHtml: config["export-extra-html"],
        secureCookie: config["secure-cookie"],
        legacyCookieDomain: config["cookie-domain"],
    });
    const port = config["export-listen-port"] || config["api-listen-port"];
    let server;
    if (config["https-crt"]) {
        const httpsConfig = {
            key: fs.readFileSync(config["https-key"]),
            cert: fs.readFileSync(config["https-crt"]),
        };
        if (config["https-ca"]) httpsConfig.ca = fs.readFileSync(config["https-ca"]);
        server = https.createServer(httpsConfig, app);
    } else {
        server = http.createServer(app);
    }
    server.listen(port, () => console.log(`Export server listening on port ${port}`));
}

if (require.main === module) {
    main();
}

module.exports = { createApp, createSerialQueue, tagtimeLineFormatter, QueueFullError, SW_SCRIPT, TZ_SCRIPT, STYLE };
