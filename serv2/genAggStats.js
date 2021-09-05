// Produces a report with aggregated stats about this instance. A database must already exist.
// Usage: `node genAggStats.js`

const Database = require("better-sqlite3");

const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};
const USER_DB_DIR = config["user-db-dir"] ? config["user-db-dir"] : (__dirname + "/user-dbs");

const globalDb = new Database("global.db", {
    readonly: true,
    fileMustExist: true,
});

function q(db, s) {
    const results = db.prepare(s).get();
    const keys = Object.keys(results);
    if (keys.length !== 1) throw new Error("invalid key count");
    return results[keys[0]];
}

const accs = q(globalDb, "SELECT COUNT(*) FROM users");
let neverUsed = 0;
let usedLastMonth = 0;
let usedLastWeek = 0;
let biggestPageCount = 0;

const now = Date.now();
for (let user = 1; user <= accs; user++) {
    let db;
    try {
        db = new Database(`${USER_DB_DIR}/${user.toString(36)}.db`, {readonly: true, fileMustExist: true});
    } catch (e) {
        console.warn("WARN: failed to open user DB for ID", user);
        continue;
    }
    const size = q(db, "PRAGMA page_count");
    if (size > biggestPageCount) biggestPageCount = size;
    const lastChangeNum = q(db, "SELECT MAX(last_change) FROM pings");
    if (lastChangeNum === null) {
        neverUsed++;
        continue;
    }
    if ((now - lastChangeNum) <= 86400 * 30) {
        usedLastMonth++;
    }
    if ((now - lastChangeNum) <= 86400 * 7) {
        usedLastWeek++;
    }
}

console.log(
`- ${accs} total accounts
- ${accs - neverUsed} total accounts have responded to at least one ping
- ${neverUsed} accounts have never responded to a ping

- ${usedLastMonth} users responded to a ping in the last 30 days
- ${usedLastWeek} users responded to a ping in the last 7 days

- largest database is ${biggestPageCount} pages (${((biggestPageCount / Math.floor(config["db-max-size"] / 4096)) * 100).toFixed(1)}% of max)`);
