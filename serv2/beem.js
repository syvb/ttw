const express = require("express");
const fetch = require("node-fetch");
const FormData = require("form-data");
const Database = require("better-sqlite3");
const setCorsHeaders = require("./setCorsHeaders");
const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};
const BEEM_URI = config.overrideBeem || "https://www.beeminder.com";
const BEEM_UA = "TagTimeWeb/1.0 (ttw@smitop.com)";
const RESYNC_FRAME = 86400 * 7; // 7 days
const USER_DB_DIR = config["user-db-dir"] ? config["user-db-dir"] : (__dirname + "/user-dbs");

let beemEditQueue = [];

async function beemEditFetch(that, uri, params = {}) {
    params.headers = params.headers || {};
    params.headers["User-Agent"] = BEEM_UA;
    let fResult;
    try {
        fResult = await fetch(uri, params);
    } catch (e) {
        console.error("Error communicating with Beeminder, retrying in 10 seconds", e);
        await new Promise((resolve, reject) => setTimeout(resolve, 10000));
        beemEditQueue.push(that);
    }
    return fResult;
}

class BeemCall {
    async run() {
        throw new Error("implement in subclass");
    }
}

function intervalToTime(int) {
    return int / 3600; // seconds -> hours
}

class BeemUpsertPoint extends BeemCall {
    constructor(token, goalId, ping, uid) {
        super();
        this.goalId = goalId;
        this.ping = ping;
        this.token = token;
        this.uid = uid;
    }
    async run() {
        const requestId = this.ping.time.toString(36);
        const comment = `${this.ping.tags.join(" ")}${this.ping.comment ? (" " + this.ping.comment) : ""} [${this.uid.toString(16)}]`;
        const uri = `${BEEM_URI}/api/v1/users/me/goals/${this.goalId}/datapoints.json?access_token=${encodeURIComponent(this.token)}&value=${encodeURIComponent((intervalToTime(this.ping.interval)).toFixed(5))}&timestamp=${encodeURIComponent(this.ping.time)}&comment=${encodeURIComponent(comment)}&requestid=${encodeURIComponent(requestId)}`;
        const editRes = await beemEditFetch(this, uri, {
            method: "POST"
        });
    }
}

class BeemBulkUpsertPoint extends BeemCall {
    constructor(token, goalId, pings, uid) {
        super();
        this.goalId = goalId;
        this.pings = pings;
        this.token = token;
        this.uid = uid;
    }
    async run() {
        const points = this.pings.map(ping => {
            const requestId = ping.time.toString(36);
            const comment = `${ping.tags.join(" ")}${ping.comment ? (" " + ping.comment) : ""} [${this.uid.toString(16)}]`;
            return {
                value: intervalToTime(ping.interval),
                timestamp: ping.time,
                comment,
                requestid: requestId,
            }
        });
        const form = new FormData();
        form.append("datapoints", JSON.stringify(points));
        const uri = `${BEEM_URI}/api/v1/users/me/goals/${this.goalId}/datapoints/create_all.json?access_token=${encodeURIComponent(this.token)}`;
        const editRes = await beemEditFetch(this, uri, {
            method: "POST",
            body: form,
        });
    }
}

const QUEUE_WAIT = 900;


setInterval(() => {
    const task = beemEditQueue.shift();
    if (task === undefined) return;
    task.run();
}, QUEUE_WAIT);

module.exports = authMiddleware => {
    const router = express.Router();

    router.get("/queue", (req, res) => {
        res.json({
            size: beemEditQueue.length,
            time: beemEditQueue.length * QUEUE_WAIT,
        })
    });

    router.post("/autofetch", (req, res) => {
        // TODO: implement this
        res.status(204).send();
    });

    // PATCH because POST is CORS-unsafe
    router.patch("/resync", authMiddleware, (req, res) => {
        setCorsHeaders(res);
        if (req.authUser === null) return res.status(403).send("log in");
        const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
        const goalsData = userDb.prepare("SELECT k, v FROM meta WHERE k IN ('retag-beem-token', 'retag-goals')").all();
        const beeToken = goalsData.filter(({ k }) => k === "retag-beem-token")[0];
        const beeGoals = goalsData.filter(({ k }) => k === "retag-goals")[0];
        if (beeToken && beeGoals) {
            const stmt = userDb.prepare("SELECT time, tags, interval, comment FROM pings WHERE time > ?");
            const pings = stmt.all((Date.now() / 1000) - RESYNC_FRAME);
            mod.pingsUpdated(pings, beeToken.v, beeGoals.v, req.authUser);
            res.status(204).send();
        } else {
            res.status(400).send("expected retag-beem-token and retag-goals in config");
        }
    });

    router.options("/resync", (req, res) => {
        setCorsHeaders(res);
        res.send();
    })

    // sync with client
    function pingFilter(row, crit) {
        if (typeof crit !== "object") return false;
        if (!Array.isArray(crit.includedTags)) return false;
        if (!Array.isArray(crit.excludedTags)) return false;
        if (typeof crit.includeType !== "string") return false;
        if (typeof row.time !== "number") return false;
        if (!Array.isArray(row.tags)) {
            if (typeof row.tags === "string") {
                row.tags = row.tags.split(" ");
            } else {
                return false;
            }
        }

        if (crit.includedTags.length > 0) {
            let valid;
            if (crit.includeType === "some") {
                valid = false;
                row.tags.forEach(tag => {
                    if (crit.includedTags.includes(tag)) valid = true;
                });
            } else {
                valid = crit.includedTags.every(tag => row.tags.includes(tag));
            }
            if (!valid) return false;
        }
        if (!row.tags.every(tag => !crit.excludedTags.includes(tag))) return false;
        let rowDate = row.time * 1000;
        if (crit.range && crit.range.length === 2) {
            if (rowDate < +crit.range[0]) return false;
            if (rowDate > +crit.range[1]) return false;
        }
        return true;
    }


    const mod = {
        router,
        pingsUpdated: (pings, token, goalData, uid) => {
            try { goalData = JSON.parse(goalData); } catch (e) { return; }
            let pingsToSend = []; // each ping + goal combo
            let affectedGoals = [];
            // const pointId = ping.time.toString(36);
            goalData.forEach(goal => {
                if (typeof goal !== "object") return;
                if (typeof goal.name !== "string") return;
                if (typeof goal.beemGoal !== "string") return;
                if (goal.beemGoal === "") return;
                const added = pings
                    .filter(ping => pingFilter(ping, goal))
                    .map(ping => ({
                        ...ping,
                        goalId: goal.beemGoal,
                    }));
                if (added.length > 0) {
                    affectedGoals.push(goal.beemGoal);
                    pingsToSend = pingsToSend.concat(added);
                }
            });
            if (pingsToSend.length === 0) return;
            affectedGoals.forEach(goal => {
                beemEditQueue.push(new BeemBulkUpsertPoint(token, goal, pingsToSend.filter(ping => ping.goalId === goal), uid))
            });
        }
    };

    return mod;
};
