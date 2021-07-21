function norm(p) {
    p.map(p => delete p.last_change);
    return p;
}

module.exports = async () => {
    const assert = require("assert").strict;
    const { getEndpoint, createAcc } = require("./util.js");

    const token = await createAcc("pingstest");

    // no pings at first
    {
        assert.deepEqual(
            JSON.parse(await getEndpoint("/pings", token)),
            {"pings":[], "config":{"ver":"1"}, "latestUpdate":3, "username":"pingstest"}
        );
        assert.deepEqual(
            JSON.parse(await getEndpoint("/internal/mini-data", token)),
            {"pings":[], "config":{"ver":"1"}, "latestUpdate":2, "totalPings": 0, "username":"pingstest"}
        );
    }

    // add a ping
    {
        await getEndpoint("/pings", token, "PATCH", JSON.stringify({
            pings: [{
                time: 1626903604,
                tags: ["afk", "cake", "eat"],
                interval: 2700,
                category: null,
                comment: null,
                last_change: 10000,
                unsynced: ""
            }]
        }));
        assert.deepEqual(
            norm(JSON.parse(await getEndpoint("/pings", token)).pings),
            [{
                time: 1626903604,
                tags: ["afk", "cake", "eat"],
                interval: 2700,
                category: null,
                comment: null,
            }]
        );
    }

    // update ping
    {
        await getEndpoint("/pings", token, "PATCH", JSON.stringify({
            pings: [{
                time: 1626903604,
                tags: ["afk", "pie", "eat"],
                interval: 2700,
                category: null,
                comment: null,
                last_change: 20000,
                unsynced: ""
            }]
        }));
        assert.deepEqual(
            norm(JSON.parse(await getEndpoint("/pings", token)).pings),
            [{
                time: 1626903604,
                tags: ["afk", "pie", "eat"],
                interval: 2700,
                category: null,
                comment: null,
            }]
        );
    }

    // add one, update one in the past
    {
        await getEndpoint("/pings", token, "PATCH", JSON.stringify({
            pings: [{
                time: 1626903604,
                tags: ["afk", "cheese", "eat"],
                interval: 2700,
                category: null,
                comment: null,
                last_change: 20000,
                unsynced: ""
            }, {
                time: 1626903699,
                tags: ["a", "b", "c"],
                interval: 2800,
                category: null,
                comment: null,
                last_change: 5000,
            }]
        }));
        assert.deepEqual(
            norm(JSON.parse(await getEndpoint("/pings", token)).pings),
            [{
                time: 1626903604,
                tags: ["afk", "cheese", "eat"],
                interval: 2700,
                category: null,
                comment: null,
            }, {
                time: 1626903699,
                tags: ["a", "b", "c"],
                interval: 2800,
                category: null,
                comment: null,
            }]
        );
    }
};
