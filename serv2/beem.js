const express = require("express");
const fetch = require("node-fetch");
const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};
const BEEM_URI = config.overrideBeem ?? "https://www.beeminder.com";
const BEEM_UA = "TagTimeWeb/1.0 (ttw@smitop.com)"

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

class BeemUpsertPoint extends BeemCall {
    constructor(token, goalId, ping) {
        super();
        this.goalId = goalId;
        this.ping = ping;
        this.token = token;
    }
    async run() {
        const requestId = this.ping.time.toString(36);
        const comment = `[${requestId}] ${this.ping.tags.join(" ")}${this.ping.comment ? (" " + this.ping.comment) : ""}`;
        const uri = `${BEEM_URI}/api/v1/users/me/goals/${this.goalId}/datapoints.json?access_token=${encodeURIComponent(this.token)}&value=${encodeURIComponent((this.ping.interval / 60).toFixed(5))}&timestamp=${encodeURIComponent(this.ping.time)}&comment=${encodeURIComponent(comment)}&requestid=${encodeURIComponent(requestId)}`;
        const editRes = await beemEditFetch(this, uri, {
            method: "POST"
        });
        console.log(await editRes.json());
    }
}

const QUEUE_WAIT = 900;


setInterval(() => {
    const task = beemEditQueue.shift();
    if (task === undefined) return;
    task.run();
}, QUEUE_WAIT);


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

// sync with client
function pingFilter(row, crit) {
    if (typeof crit !== "object") return false;
    if (!Array.isArray(crit.includedTags)) return false;
    if (!Array.isArray(crit.excludedTags)) return false;
    if (typeof crit.includeType !== "string") return false;
    if (typeof row.time !== "number") return false;
    if (!Array.isArray(row.tags)) return false;

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


module.exports = {
    router,
    pingsUpdated: async (pings, token, goalData) => {
        try { goalData = JSON.parse(goalData); } catch (e) { return; }
        let pingsToSend = []; // each ping + goal combo
        // const pointId = ping.time.toString(36);
        goalData.forEach(goal => {
            if (typeof goal !== "object") return;
            if (typeof goal.name !== "string") return;
            const added = pings
                .filter(ping => pingFilter(ping, goal))
                .map(ping => ({
                    ...ping,
                    goalId: goal.beemGoal,
                }));
            pingsToSend = pingsToSend.concat(added);
        });
        if (pingsToSend.length === 0) return;
        pingsToSend.forEach(ping => {
            beemEditQueue.push(new BeemUpsertPoint(token, ping.goalId, ping));
        });
    }
};
