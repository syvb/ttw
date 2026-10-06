// Deletes an account and everything stored about it from a shut-down instance,
// such as when someone asks for their data to be deleted. The export server can
// keep running: the account stops working as soon as this finishes.
//
// Usage (from the serv2 directory, on the server):
//   node delete-user.js <username>             dry run: shows what would be deleted
//   node delete-user.js <username> --delete    deletes it
// Options:
//   --id <user ID>      Pick the account by user ID instead of username. Needed when
//                       several accounts have the username, or to delete data left
//                       from an account that's already gone.
//   --global-db, --auth-db, --user-db-dir  Database locations. By default, the
//                       ones the export server uses.
//   --sent-log <file>   email-users.js's sent log. Defaults to the one it uses.
//
// This deletes the account's username and password hash, email addresses, login
// cookies and API tokens, its user database (pings and settings, including any
// Beeminder token), and sent log entries for its email addresses, unless another
// account has the same address. Deleted rows are overwritten, and global.db and
// auth.db are vacuumed so that copies left in their free space by earlier
// changes, such as old logouts, go too. Backups aren't touched. Push
// subscriptions aren't linked to accounts, so they stay.
//
// The shutdown steps make the data read-only, so --delete usually needs sudo.

"use strict";

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { dataPaths, userDbFile } = require("./export-server.js");
const { DEFAULT_SENT_LOG } = require("./email-users.js");

const USAGE = "Usage: node delete-user.js <username> [--delete], or node delete-user.js --id <user ID> [--delete]";
const READ_ONLY = { readonly: true, fileMustExist: true };

const OPTIONS = {
    "--id": "value",
    "--delete": "flag",
    "--global-db": "value",
    "--auth-db": "value",
    "--user-db-dir": "value",
    "--sent-log": "value",
};

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const name = argv[i];
        if (!name.startsWith("-")) {
            if (args.username !== undefined) throw new Error(`Unexpected argument: ${name}. ${USAGE}`);
            args.username = name;
            continue;
        }
        if (!OPTIONS[name]) throw new Error(`Unknown option: ${name}`);
        const key = name.slice(2);
        if (OPTIONS[name] === "flag") {
            args[key] = true;
        } else {
            if (i + 1 >= argv.length) throw new Error(`${name} needs a value`);
            args[key] = argv[++i];
        }
    }
    if ((args.username === undefined) === (args.id === undefined)) throw new Error(USAGE);
    if (args.id !== undefined) {
        if (!/^\d+$/.test(args.id) || !Number.isSafeInteger(Number(args.id))) throw new Error(`--id must be a user ID, like 123, not ${args.id}`);
        args.id = Number(args.id);
    }
    return args;
}

const normalizeEmail = email => email.trim().toLowerCase();

function plural(n, singular, pluralForm = singular + "s") {
    return `${n} ${n === 1 ? singular : pluralForm}`;
}

function formatSize(bytes) {
    if (bytes < 1024) return plural(bytes, "byte");
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ms) {
    try {
        return new Date(ms).toISOString().slice(0, 10);
    } catch (e) {
        return "on an unknown date";
    }
}

// Size of a file, or null if it doesn't exist.
function fileSize(file) {
    let stat;
    try {
        stat = fs.lstatSync(file);
    } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
    }
    // deleting a symlink would leave the data it points to
    if (!stat.isFile()) throw new Error(`${file} is a symlink or something else that isn't a file, so deleting it might not delete the data. Delete it by hand.`);
    return stat.size;
}

/**
 * Removes an account's entries from email-users.js's sent log, which has one
 * JSON object per line. Entries for addresses in `shared` stay, since another
 * account has that address too. Returns the new text, how many entries were
 * removed and kept for each address, and the line numbers of lines that aren't
 * valid JSON but mention one of the addresses, which also stay.
 */
function filterSentLog(text, emails, shared) {
    const mine = new Set(emails.map(normalizeEmail).filter(email => email !== ""));
    const removed = new Map();
    const kept = new Map();
    const unreadable = [];
    const count = (map, email) => map.set(email, (map.get(email) || 0) + 1);
    const lines = text.split("\n").filter((line, i) => {
        if (line.trim() === "") return true;
        let email;
        try {
            const entry = JSON.parse(line);
            if (entry && typeof entry.email === "string") email = normalizeEmail(entry.email);
        } catch (e) {}
        if (email === undefined) {
            const lower = line.toLowerCase();
            if ([...mine].some(address => lower.includes(address))) unreadable.push(i + 1);
            return true;
        }
        if (!mine.has(email)) return true;
        if (shared.has(email)) {
            count(kept, email);
            return true;
        }
        count(removed, email);
        return false;
    });
    return { text: lines.join("\n"), removed, kept, unreadable };
}

// Runs fn on global.db or auth.db, explaining the error a read-only connection
// gets when an interrupted write left a journal that needs rolling back.
function readDb(file, fn) {
    const db = new Database(file, READ_ONLY);
    try {
        return fn(db);
    } catch (e) {
        if (e.code === "SQLITE_READONLY_ROLLBACK") {
            throw new Error(`${file} has a journal left from an interrupted write, so it can't be read until it's rolled back. Run sqlite3 ${file} "PRAGMA quick_check" as root, then try again.`);
        }
        throw e;
    } finally {
        db.close();
    }
}

/**
 * Finds everything stored about an account, picked by username or user ID,
 * without changing anything. Throws if there's no such account or the username
 * is ambiguous.
 */
function findAccount(paths, { username, id }) {
    if (!fs.existsSync(paths.globalDbPath)) {
        throw new Error(`${paths.globalDbPath} doesn't exist. Run this from the serv2 directory, or use --global-db.`);
    }
    const account = readDb(paths.globalDbPath, globalDb => {
        if (username !== undefined) {
            // the same normalization as logging in
            const name = username.trim().toLowerCase();
            const ids = globalDb.prepare("SELECT id FROM users WHERE username = ? ORDER BY id").pluck().all(name);
            if (ids.length === 0) throw new Error(`No account is named ${name}`);
            if (ids.length > 1) {
                throw new Error(`${ids.length} accounts are named ${name}: ${ids.map(n => `#${n}`).join(", ")}. Pick one with --id. Logging in as ${name} logs in to #${ids[0]}.`);
            }
            id = ids[0];
        }
        const user = globalDb.prepare("SELECT username, register_date FROM users WHERE id = ?").get(id);
        const emails = globalDb.prepare("SELECT email FROM emails WHERE user_id = ? ORDER BY id").pluck().all(id);
        // other accounts with any of the same addresses, by address
        const mine = new Set(emails.map(normalizeEmail));
        const sharedEmails = new Map();
        const others = globalDb.prepare("SELECT users.id, users.username, emails.email FROM emails JOIN users ON users.id = emails.user_id WHERE users.id != ? ORDER BY users.id").all(id);
        for (const other of others) {
            const email = normalizeEmail(other.email);
            if (!mine.has(email)) continue;
            if (!sharedEmails.has(email)) sharedEmails.set(email, []);
            const label = `#${other.id} ${other.username}`;
            if (!sharedEmails.get(email).includes(label)) sharedEmails.get(email).push(label);
        }
        return {
            id,
            username: user ? user.username : null,
            registerDate: user ? user.register_date : null,
            emails,
            sharedEmails,
            sameUsername: user ? globalDb.prepare("SELECT id FROM users WHERE username = ? AND id != ? ORDER BY id").pluck().all(user.username, id) : [],
        };
    });

    account.hasAuthDb = fs.existsSync(paths.authDbPath);
    account.tokens = 0;
    account.apiTokens = 0;
    if (account.hasAuthDb) {
        const tokens = readDb(paths.authDbPath, authDb => authDb.prepare("SELECT token_data FROM tokens WHERE user_id = ?").pluck().all(account.id));
        account.tokens = tokens.length;
        account.apiTokens = tokens.filter(token => typeof token === "string" && token.startsWith("api!")).length;
    }

    account.userDb = userDbFile(paths.userDbDir, account.id);
    // including anything SQLite left next to it
    account.userDbFiles = ["", "-journal", "-wal", "-shm"]
        .map(suffix => ({ path: account.userDb + suffix, size: fileSize(account.userDb + suffix) }))
        .filter(file => file.size !== null);
    if (account.userDbFiles.some(file => file.path === account.userDb)) {
        try {
            const userDb = new Database(account.userDb, READ_ONLY);
            try {
                account.pings = userDb.prepare("SELECT COUNT(*) FROM pings").pluck().get();
            } finally {
                userDb.close();
            }
        } catch (e) {
            account.pingsError = e.message;
        }
    }

    account.sentLog = { removed: new Map(), kept: new Map(), unreadable: [] };
    if (account.emails.length > 0 && fs.existsSync(paths.sentLogPath)) {
        account.sentLog = filterSentLog(fs.readFileSync(paths.sentLogPath, "utf-8"), account.emails, account.sharedEmails);
    }

    if (account.username === null && account.emails.length === 0 && account.tokens === 0 && account.userDbFiles.length === 0) {
        throw new Error(`No data found for account #${account.id}`);
    }
    return account;
}

// What findAccount found, as lines to print.
function describe(account, paths) {
    const lines = [account.username === null
        ? `There's no account #${account.id}, but some of its data is left. This deletes:`
        : `Account #${account.id} ${account.username}, registered ${formatDate(account.registerDate)}. This deletes:`];
    const globalParts = [];
    if (account.username !== null) globalParts.push("the account (username and password hash)");
    if (account.emails.length > 0) {
        globalParts.push(`${plural(account.emails.length, "email address", "email addresses")}: ${account.emails.map(email => email.trim()).join(", ")}`);
    }
    if (globalParts.length > 0) lines.push(`  ${paths.globalDbPath}: ${globalParts.join(", and ")}`);
    if (account.tokens > 0) {
        const parts = [];
        const cookies = account.tokens - account.apiTokens;
        if (cookies > 0) parts.push(plural(cookies, "login cookie"));
        if (account.apiTokens > 0) parts.push(plural(account.apiTokens, "API token"));
        lines.push(`  ${paths.authDbPath}: ${parts.join(" and ")}`);
    }
    for (const file of account.userDbFiles) {
        let what = formatSize(file.size);
        if (file.path === account.userDb) {
            what = account.pingsError === undefined
                ? `${plural(account.pings, "ping")}, ${what}`
                : `${what}, which can't be read (${account.pingsError})`;
        }
        lines.push(`  ${file.path}: ${what}`);
    }
    for (const [email, n] of account.sentLog.removed) {
        lines.push(`  ${paths.sentLogPath}: ${plural(n, "entry", "entries")} for ${email}`);
    }
    for (const [email, n] of account.sentLog.kept) {
        lines.push(`keep   ${paths.sentLogPath}: ${plural(n, "entry", "entries")} for ${email}, since ${account.sharedEmails.get(email).join(" and ")} also has that address`);
    }
    for (const line of account.sentLog.unreadable) {
        lines.push(`warn   ${paths.sentLogPath} line ${line} isn't valid JSON, so it stays, but it mentions this account's email address. Check it by hand.`);
    }
    if (!account.hasAuthDb) lines.push(`note   ${paths.authDbPath} doesn't exist, so there are no tokens to delete`);
    if (account.userDbFiles.length === 0) lines.push(`note   no user database at ${account.userDb}`);
    if (account.sameUsername.length > 0) {
        const others = account.sameUsername.map(n => `#${n}`).join(", ");
        lines.push(`note   ${others} ${account.sameUsername.length === 1 ? "is" : "are"} also named ${account.username}. Afterwards, logging in as ${account.username} logs in to #${account.sameUsername[0]}.`);
    }
    return lines;
}

// Files and directories that deleting the account writes to but this user can't.
function writeProblems(paths, account) {
    const problems = [];
    const check = (target, isDir) => {
        try {
            fs.accessSync(target, isDir ? fs.constants.W_OK | fs.constants.X_OK : fs.constants.W_OK);
        } catch (e) {
            const label = isDir ? `${target} (directory)` : target;
            if (!problems.includes(label)) problems.push(label);
        }
    };
    // SQLite writes a journal next to each database
    check(paths.globalDbPath, false);
    check(path.dirname(paths.globalDbPath), true);
    if (account.hasAuthDb) {
        check(paths.authDbPath, false);
        check(path.dirname(paths.authDbPath), true);
    }
    if (account.userDbFiles.length > 0) check(path.dirname(account.userDb), true);
    // the sent log is replaced with a new file
    if (account.sentLog.removed.size > 0) check(path.dirname(paths.sentLogPath), true);
    return problems;
}

// Replaces the sent log with a copy that doesn't have the account's entries.
function rewriteSentLog(file, account) {
    const { text } = filterSentLog(fs.readFileSync(file, "utf-8"), account.emails, account.sharedEmails);
    const stat = fs.statSync(file);
    const tmp = `${file}.${process.pid}.tmp`;
    try {
        const fd = fs.openSync(tmp, "wx", 0o600);
        try {
            fs.writeFileSync(fd, text);
            fs.fchmodSync(fd, stat.mode & 0o7777);
            // with sudo, keep it owned by the same user, so email-users.js can still write to it
            if (process.getuid && process.getuid() === 0) fs.fchownSync(fd, stat.uid, stat.gid);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(tmp, file);
    } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
    }
}

/**
 * Deletes what findAccount found. Returns warnings about vacuuming, which
 * happens after the account is deleted.
 */
function deleteAccount(paths, account, { timeout = 5000 } = {}) {
    const db = new Database(paths.globalDbPath, { fileMustExist: true, timeout });
    try {
        if (account.hasAuthDb) db.prepare("ATTACH DATABASE ? AS auth").run(paths.authDbPath);
        // overwrite deleted rows, instead of only marking their space as free
        db.pragma("secure_delete = ON");
        // The rows of both databases are deleted in one transaction, which only
        // commits once the files are deleted too. If anything fails, the account
        // is still there, so running this again finishes the job.
        db.transaction(() => {
            if (account.hasAuthDb) db.prepare("DELETE FROM auth.tokens WHERE user_id = ?").run(account.id);
            db.prepare("DELETE FROM main.emails WHERE user_id = ?").run(account.id);
            db.prepare("DELETE FROM main.users WHERE id = ?").run(account.id);
            if (account.sentLog.removed.size > 0) rewriteSentLog(paths.sentLogPath, account);
            for (const file of account.userDbFiles) fs.rmSync(file.path, { force: true });
        })();

        // Rebuilding the databases clears out rows deleted before now, which
        // weren't overwritten, such as tokens from old logouts.
        const warnings = [];
        const schemas = account.hasAuthDb ? [["main", paths.globalDbPath], ["auth", paths.authDbPath]] : [["main", paths.globalDbPath]];
        for (const [schema, file] of schemas) {
            try {
                db.exec(`VACUUM ${schema}`);
            } catch (e) {
                warnings.push(`Couldn't vacuum ${file}: ${e.message}. The account is deleted, but data deleted before now, such as old login cookies, can stay in its free space until it's vacuumed, such as with sqlite3 ${file} VACUUM.`);
            }
        }
        return warnings;
    } finally {
        db.close();
    }
}

// Like email-users.js, works without config files, using the defaults.
function loadConfig() {
    const root = path.join(__dirname, "..");
    const read = name => {
        const file = path.join(root, name);
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : {};
    };
    return { ...read("config.json"), ...read("config-private.json") };
}

function main(argv, { config = loadConfig(), log = console.log, timeout } = {}) {
    const args = parseArgs(argv);
    const defaults = dataPaths(config);
    const paths = {
        globalDbPath: path.resolve(args["global-db"] || defaults.globalDbPath),
        authDbPath: path.resolve(args["auth-db"] || defaults.authDbPath),
        userDbDir: path.resolve(args["user-db-dir"] || defaults.userDbDir),
        sentLogPath: path.resolve(args["sent-log"] || DEFAULT_SENT_LOG),
    };
    const account = findAccount(paths, args);
    for (const line of describe(account, paths)) log(line);
    const problems = writeProblems(paths, account);
    if (!args.delete) {
        if (problems.length > 0) log(`note   --delete needs to write to ${problems.join(", ")}, which you can't. Run it as root, such as with sudo.`);
        log("Dry run: nothing was deleted. Add --delete to delete it.");
        return;
    }
    if (problems.length > 0) {
        throw new Error(`Nothing was deleted, since you can't write to ${problems.join(", ")}. The shutdown steps make the data read-only, so run this as root, such as with sudo.`);
    }
    const warnings = deleteAccount(paths, account, { timeout });
    log(account.username === null ? `Deleted the data left from account #${account.id}.` : `Deleted account #${account.id} ${account.username}.`);
    for (const warning of warnings) log(`WARN   ${warning}`);
    log("Backups made before now, such as the one from the shutdown steps, still have its data.");
    if (warnings.length > 0) process.exitCode = 1;
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    }
}

module.exports = { parseArgs, filterSentLog, findAccount, main };
