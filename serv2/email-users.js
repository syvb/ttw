// Emails every user who has an email address and at least one ping, using
// Cloudflare Email Service. Meant for announcing the shutdown.
//
// Usage (from the serv2 directory):
//   node email-users.js --template shutdown-email.txt
//
// This is a dry run by default: it prints who would get what and sends nothing.
// Options:
//   --template <file>   Required. The first line is "Subject: ...", then a blank
//                       line, then the body. {{usernames}} is replaced with the
//                       recipient's usernames. The body can use **bold** and
//                       [text](url) links.
//   --send              Actually send to real users.
//   --test-to <address> Send one email, built for the first real recipient, to
//                       this address instead. Never sends to real users.
//   --sent-log <file>   Records each address as it's sent to, and skips addresses
//                       already in it, so an interrupted run can be resumed.
//                       Defaults to email-sent.log.
//   --global-db, --user-db-dir  Database locations, as in export-server.js.
//   --delay <ms>        Wait between emails. Defaults to 200.
// The API token comes from CF_API_TOKEN, or the file named by CF_API_TOKEN_FILE
// (default ~/.cf_token). It needs permission to send email.

"use strict";

const Database = require("better-sqlite3");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CF_ACCOUNT_ID = "c84e7707c8cc68f8afb9bbe7dff97bf4";
const FROM = "TagTime Web <noreply@ttw.smitop.com>";
const REPLY_TO = "me@iter.ca";
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Finds everyone to email. Returns { recipients, skipped }, where each recipient
 * is { email, accounts: [{ id, username, pings, canLogIn }] } with one entry per
 * address, and skipped lists accounts that won't be emailed and why.
 */
function findRecipients(globalDbPath, userDbDir) {
    const readOnly = { readonly: true, fileMustExist: true };
    const globalDb = new Database(globalDbPath, readOnly);
    const rows = globalDb.prepare(`
        SELECT users.id, users.username, emails.email,
            users.id = (SELECT MIN(u2.id) FROM users u2 WHERE u2.username = users.username) AS can_log_in
        FROM emails JOIN users ON users.id = emails.user_id
        ORDER BY users.id
    `).all();
    globalDb.close();

    const byEmail = new Map();
    const skipped = [];
    for (const row of rows) {
        const email = row.email.trim();
        const account = { id: row.id, username: row.username, canLogIn: row.can_log_in === 1 };
        if (!SIMPLE_EMAIL.test(email)) {
            skipped.push({ ...account, email, reason: "invalid email address" });
            continue;
        }
        const file = path.join(userDbDir, `${row.id.toString(36)}.db`);
        if (!fs.existsSync(file)) {
            skipped.push({ ...account, email, reason: "no user database" });
            continue;
        }
        const userDb = new Database(file, readOnly);
        account.pings = userDb.prepare("SELECT COUNT(*) AS n FROM pings").get().n;
        userDb.close();
        if (account.pings === 0) {
            skipped.push({ ...account, email, reason: "no pings" });
            continue;
        }
        const key = email.toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, { email, accounts: [] });
        const accounts = byEmail.get(key).accounts;
        // the same address can be stored more than once for one account
        if (!accounts.some(a => a.id === account.id)) accounts.push(account);
    }
    return { recipients: [...byEmail.values()], skipped };
}

function parseTemplate(source) {
    const match = source.match(/^Subject: *(.+)\r?\n\r?\n([\s\S]+)$/);
    if (!match) throw new Error('The template must start with "Subject: ...", then a blank line, then the body');
    return { subject: match[1].trim(), body: match[2] };
}

// The bits of Markdown the template can use: [text](url) links and **bold**.
// Bare URLs are linked too.
const INLINE_MARKUP = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

function inlineToHtml(source) {
    let html = "";
    let last = 0;
    for (const match of source.matchAll(INLINE_MARKUP)) {
        html += escapeHtml(source.slice(last, match.index));
        const [, linkText, linkUrl, bold, url] = match;
        if (linkUrl) html += `<a href="${escapeHtml(linkUrl)}">${escapeHtml(linkText)}</a>`;
        else if (bold) html += `<strong>${escapeHtml(bold)}</strong>`;
        else html += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
        last = match.index + match[0].length;
    }
    return html + escapeHtml(source.slice(last));
}

function inlineToText(source) {
    return source.replace(INLINE_MARKUP, (all, linkText, linkUrl, bold, url) =>
        linkUrl ? `${linkText} (${linkUrl})` : bold ? bold : url);
}

// Builds the email for one recipient, as both plain text and HTML since
// Cloudflare recommends sending both.
function buildMessage(template, recipient) {
    const names = recipient.accounts.map(a => a.username);
    const usernames = names.length === 1 ? names[0]
        : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
    const source = template.body.replace(/\{\{usernames\}\}/g, usernames);
    const text = inlineToText(source);
    const html = source.trim().split(/\r?\n\s*\r?\n/).map(paragraph =>
        "<p>" + inlineToHtml(paragraph).replace(/\r?\n/g, "<br>\n") + "</p>"
    ).join("\n");
    return { subject: template.subject, text, html };
}

/**
 * Sends one email through Cloudflare Email Service. Retries when rate limited
 * or on server errors. Returns the API's result
 * ({ delivered, queued, permanent_bounces, suppressed_recipients, ... }), or throws.
 */
async function sendEmail({ accountId, token, fetchImpl = fetch, sleep }, message) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`;
    for (let attempt = 1; ; attempt++) {
        const res = await fetchImpl(url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(message),
        });
        let data;
        try {
            data = await res.json();
        } catch (e) {
            data = null;
        }
        if (res.ok && data && data.success) return data.result;
        const errors = data && Array.isArray(data.errors) ? data.errors : [];
        const rateLimited = res.status === 429 || errors.some(e => e.code === 10004);
        if ((rateLimited || res.status >= 500) && attempt < MAX_ATTEMPTS) {
            await sleep(1000 * 2 ** attempt);
            continue;
        }
        const detail = errors.map(e => `${e.code}: ${e.message}`).join("; ") || `HTTP ${res.status}`;
        throw new Error(`Sending failed: ${detail}`);
    }
}

function parseArgs(argv) {
    const flags = new Set(["--send"]);
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const name = argv[i];
        if (!name.startsWith("--")) throw new Error(`Unexpected argument: ${name}`);
        const key = name.slice(2);
        if (flags.has(name)) {
            args[key] = true;
        } else {
            if (i + 1 >= argv.length) throw new Error(`${name} needs a value`);
            args[key] = argv[++i];
        }
    }
    return args;
}

function loadConfig() {
    const root = path.join(__dirname, "..");
    const read = name => {
        const file = path.join(root, name);
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : {};
    };
    return { ...read("config.json"), ...read("config-private.json") };
}

async function main(argv, { fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), log = console.log, env = process.env } = {}) {
    const args = parseArgs(argv);
    if (!args.template) throw new Error("--template is required");
    if (args.send && args["test-to"]) throw new Error("Use either --send or --test-to, not both");
    const config = loadConfig();
    const globalDbPath = args["global-db"] || config["global-db"] || path.resolve("global.db");
    const userDbDir = args["user-db-dir"] || config["user-db-dir"] || path.join(__dirname, "user-dbs");
    const sentLogPath = args["sent-log"] || "email-sent.log";
    const delay = args.delay === undefined ? 200 : Number(args.delay);
    const template = parseTemplate(fs.readFileSync(args.template, "utf-8"));

    const { recipients, skipped } = findRecipients(globalDbPath, userDbDir);
    const alreadySent = new Set(fs.existsSync(sentLogPath)
        ? fs.readFileSync(sentLogPath, "utf-8").split("\n").filter(Boolean).map(line => JSON.parse(line).email.toLowerCase())
        : []);
    const pending = recipients.filter(r => !alreadySent.has(r.email.toLowerCase()));

    for (const s of skipped) log(`skip   ${s.username} (#${s.id}) <${s.email}>: ${s.reason}`);
    for (const r of recipients) {
        for (const a of r.accounts.filter(a => !a.canLogIn)) {
            log(`warn   ${a.username} (#${a.id}) <${r.email}> has a duplicate username, so it can't log in to the export server`);
        }
    }
    log(`${recipients.length} addresses to email, ${recipients.length - pending.length} already sent, ${pending.length} left; ${skipped.length} accounts skipped`);

    const sending = args.send || args["test-to"];
    const accountId = CF_ACCOUNT_ID;
    let token;
    if (sending) {
        const tokenFile = env.CF_API_TOKEN_FILE || path.join(os.homedir(), ".cf_token");
        token = env.CF_API_TOKEN || (fs.existsSync(tokenFile) && fs.readFileSync(tokenFile, "utf-8").trim());
        if (!token) throw new Error("Set CF_API_TOKEN or CF_API_TOKEN_FILE, or put the token in ~/.cf_token, to send");
    }

    if (args["test-to"]) {
        if (recipients.length === 0) throw new Error("No recipients to build a test email for");
        const message = buildMessage(template, recipients[0]);
        log(`test   sending the email for ${recipients[0].accounts.map(a => a.username).join(", ")} to ${args["test-to"]}`);
        const result = await sendEmail({ accountId, token, fetchImpl, sleep }, { ...message, to: args["test-to"], from: FROM, reply_to: REPLY_TO });
        log(`test   result: ${JSON.stringify(result)}`);
        return;
    }

    if (!args.send) {
        if (pending.length > 0) {
            const example = buildMessage(template, pending[0]);
            log(`\nExample email to ${pending[0].email}:\nSubject: ${example.subject}\n\n${example.text}`);
        }
        for (const r of pending) log(`would  ${r.email}: ${r.accounts.map(a => `${a.username} (${a.pings} pings)`).join(", ")}`);
        log("\nDry run: nothing was sent. Add --send to send.");
        return;
    }

    let failures = 0;
    for (const [i, r] of pending.entries()) {
        const message = buildMessage(template, r);
        try {
            const result = await sendEmail({ accountId, token, fetchImpl, sleep }, { ...message, to: r.email, from: FROM, reply_to: REPLY_TO });
            fs.appendFileSync(sentLogPath, JSON.stringify({ email: r.email, time: new Date().toISOString(), result }) + "\n");
            const has = key => result && Array.isArray(result[key]) && result[key].length > 0;
            const status = has("permanent_bounces") ? "bounce" : has("suppressed_recipients") ? "suppr " : "sent  ";
            log(`${status} ${i + 1}/${pending.length} ${r.email}`);
        } catch (e) {
            failures++;
            log(`FAIL   ${i + 1}/${pending.length} ${r.email}: ${e.message}`);
        }
        if (delay > 0 && i < pending.length - 1) await sleep(delay);
    }
    log(`Done. ${pending.length - failures} sent, ${failures} failed. Run again to retry failures.`);
    if (failures > 0) process.exitCode = 1;
}

if (require.main === module) {
    main(process.argv.slice(2)).catch(e => {
        console.error(e.message);
        process.exitCode = 1;
    });
}

module.exports = { findRecipients, parseTemplate, buildMessage, sendEmail, main };
