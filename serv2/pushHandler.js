const express = require("express");
const bodyParser = require("body-parser");
const webPush = require("web-push");
const taglogic = require("./pkg/taglogic.js");
const setCorsHeaders = require("./setCorsHeaders");

const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};

webPush.setVapidDetails(
    "mailto:ttw@smitop.com",
    config["vapid-public"],
    config["vapid-private"]
);

module.exports = function pushHandler(globalDb) {
    const pushPreped = {
        "delete-sub": globalDb.prepare("DELETE FROM pushregs WHERE endpoint_uri = ? AND p256dh = ? AND auth = ?"),
        "get-sub": globalDb.prepare("SELECT seed, avg_interval FROM pushregs WHERE endpoint_uri = ? AND p256dh = ? AND auth = ?"),
        "add-sub": globalDb.prepare("INSERT OR REPLACE INTO pushregs (endpoint_uri, p256dh, auth, seed, avg_interval) VALUES (?, ?, ?, ?, ?)"),
        "get-pints-subs": globalDb.prepare("SELECT p256dh, auth, endpoint_uri FROM pushregs WHERE seed = ? AND avg_interval = ?"),
        "get-pints": globalDb.prepare("SELECT DISTINCT seed, avg_interval FROM pushregs"),
    };

    const router = express.Router();
    let pints = [];

    function sendNotification(subscription, latestPing) {
        webPush.sendNotification(subscription, JSON.stringify({
            type: "ping",
            latestPing,
        })).then(function () {
            // console.log("Push Application Server - Notification sent to " + subscription.endpoint);
        }).catch(function (e) {
            console.log("ERROR in sending Notification, endpoint removed");
            pushPreped["delete-sub"].run(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
        });
    }

    let lastCheck = Math.floor(Date.now() / 1000);
    function checkPints() {
        let now = Math.floor(Date.now() / 1000);
        pints.forEach(pint => {
            const between = taglogic.pings_between_u32(lastCheck, now, pint);
            if (between.length > 0) {
                const usersToNotify = pushPreped["get-pints-subs"].all(pint.seed, pint.avg_interval);
                usersToNotify.forEach(user => {
                    const subscription = {
                        endpoint: user.endpoint_uri,
                        keys: {
                            p256dh: user.p256dh,
                            auth: user.auth,
                        }
                    };
                    sendNotification(subscription, between[between.length - 1]);
                });
            }
        });
        lastCheck = now;
        setTimeout(checkPints, 1750);
    }
    checkPints();

    router.get("/vapid-public", (req, res) => {
        setCorsHeaders(res);
        res.send(config["vapid-public"]);
    });

    router.post("/register", bodyParser.json({ limit: 10000 }), (req, res) => {
        setCorsHeaders(res);
        const json = req.body;
        if (typeof json !== "object") return res.status(400).send("no body");
        if (typeof json.subscription !== "object") return res.status(400).send("no subscription");
        const subscription = json.subscription;
        if (typeof subscription.endpoint !== "string") return res.status(400).send("no subscription");
        if (typeof subscription.keys.p256dh !== "string") return res.status(400).send("no p256dh");
        if (typeof subscription.keys.auth !== "string") return res.status(400).send("no auth");
        const pintData = json.pintData;
        if (typeof pintData.seed !== "number") return res.status(400).send("no seed");
        if (typeof pintData.avg_interval !== "number") return res.status(400).send("no avg_interval");
        pushPreped["add-sub"].run(
            subscription.endpoint,
            subscription.keys.p256dh,
            subscription.keys.auth,
            pintData.seed,
            pintData.avg_interval
        );
        res.status(201).send();
    });

    router.post("/unregister", bodyParser.json({ limit: 10000 }), (req, res) => {
        setCorsHeaders(res);
        const json = req.body;
        if (typeof json !== "object") return res.status(400).send("no body");
        if (typeof json.subscription !== "object") return res.status(400).send("no subscription");
        const subscription = json.subscription;
        if (typeof subscription.endpoint !== "string") return res.status(400).send("no subscription");
        if (typeof subscription.keys.p256dh !== "string") return res.status(400).send("no p256dh");
        if (typeof subscription.keys.auth !== "string") return res.status(400).send("no auth");
        pushPreped["delete-sub"].run(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
        res.status(201).send();
        pints = pushPreped["get-pints"].all().map(({ seed, avg_interval }) => taglogic.new_ping_interval_data(seed, avg_interval));
    });
    pints = pushPreped["get-pints"].all().map(({ seed, avg_interval }) => taglogic.new_ping_interval_data(seed, avg_interval));

    router.options("/register", (req, res) => {
        setCorsHeaders(res);
        res.send();
    });
    router.options("/unregister", (req, res) => {
        setCorsHeaders(res);
        res.send();
    });

    return router;
}
