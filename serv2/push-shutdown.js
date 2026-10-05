// Sends one push to every push subscription after a shutdown, so browsers
// replace the old app's service worker without the user opening the app.
//
// Waking a service worker for a push makes the browser check /sw.js for an
// update if it hasn't checked in the last day. Once /sw.js on the old frontend
// domain serves the replacement service worker (see shutdown-worker.mjs), that
// update removes the old app. The old app only shows notifications for pings,
// so this push shows none, although Chrome may show "This site has been updated
// in the background".
//
// Usage (from the serv2 directory, with the config that has the VAPID keys):
//   node push-shutdown.js          dry run: counts the subscriptions
//   node push-shutdown.js --send   sends the pushes
// Options: --global-db <path> (default global.db in the working directory, as in index.js)
// Works on Node 14, so it can run on the old server.

"use strict";

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

// keep trying to deliver to offline devices for 4 weeks, the most push services allow
const PUSH_TTL = 28 * 24 * 60 * 60;

function loadConfig() {
    const root = path.join(__dirname, "..");
    const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf-8"));
    return { ...read("config.json"), ...read("config-private.json") };
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--send") args.send = true;
        else if (argv[i] === "--global-db" && i + 1 < argv.length) args.globalDb = argv[++i];
        else throw new Error(`Unknown option: ${argv[i]}`);
    }
    return args;
}

async function main(argv, { webPush = require("web-push"), log = console.log, config = loadConfig() } = {}) {
    const args = parseArgs(argv);
    const globalDb = new Database(args.globalDb || path.resolve("global.db"), { readonly: true, fileMustExist: true });
    const subscriptions = globalDb.prepare("SELECT endpoint_uri, p256dh, auth FROM pushregs ORDER BY endpoint_uri").all();
    globalDb.close();

    // the endpoint URLs work like passwords, so only show which push service each is on
    const hostOf = sub => {
        try {
            return new URL(sub.endpoint_uri).host;
        } catch (e) {
            return "(invalid endpoint)";
        }
    };
    const byHost = {};
    for (const sub of subscriptions) byHost[hostOf(sub)] = (byHost[hostOf(sub)] || 0) + 1;
    log(`${subscriptions.length} push subscriptions: ${Object.keys(byHost).map(host => `${byHost[host]} on ${host}`).join(", ")}`);

    if (!args.send) {
        log("Dry run: nothing was sent. Add --send to send.");
        return;
    }
    if (!config["vapid-public"] || !config["vapid-private"]) throw new Error("vapid-public and vapid-private must be in the config to send");
    webPush.setVapidDetails("mailto:" + config["contact-email"], config["vapid-public"], config["vapid-private"]);

    const counts = { sent: 0, gone: 0, failed: 0 };
    for (const [i, sub] of subscriptions.entries()) {
        const progress = `${i + 1}/${subscriptions.length} ${hostOf(sub)}`;
        try {
            await webPush.sendNotification(
                { endpoint: sub.endpoint_uri, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify({ type: "shutdown" }),
                { TTL: PUSH_TTL }
            );
            counts.sent++;
            log(`sent   ${progress}`);
        } catch (e) {
            // the subscription has expired or been removed
            if (e.statusCode === 404 || e.statusCode === 410) {
                counts.gone++;
                log(`gone   ${progress}`);
            } else {
                counts.failed++;
                log(`FAIL   ${progress}: ${e.statusCode ? `HTTP ${e.statusCode} ` : ""}${e.body || e.message}`);
            }
        }
    }
    log(`Done. ${counts.sent} sent, ${counts.gone} no longer subscribed, ${counts.failed} failed.`);
    if (counts.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
    main(process.argv.slice(2)).catch(e => {
        console.error(e.message);
        process.exitCode = 1;
    });
}

module.exports = { main, PUSH_TTL };
