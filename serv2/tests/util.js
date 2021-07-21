// utilities for tests

const fetch = require("node-fetch");
const http = require("http");
const assert = require("assert").strict;
const { resolve } = require("path");

module.exports = {
    config: {
        ...require("../../config.json"),
        ...require("../../config-private.json")
    },
    createAcc: (username, pw = "supersecret123", shouldWork = true) => {
        // don't want redirect
        return new Promise((resolve, reject) => {
            const body = `pw=${pw}&pw2=${pw}&username=${username}&email=${username}@example.com`;
            const req = http.request(module.exports.config["api-server"] + "/internal/register", {
                method: "POST",
                headers: {
                    "Content-Length": body.length,
                    "Content-Type": "application/x-www-form-urlencoded",
                }
            }, res => {
                const loc = res.headers.location;
                if (!shouldWork) {
                    assert.equal(loc, undefined);
                    return resolve();
                }
                assert(loc.endsWith("/welcome"));
                assert(loc.startsWith(module.exports.config["root-domain"]));
                const setCookies = res.headers["set-cookie"];
                assert.equal(setCookies.length, 1);
                assert(setCookies[0].startsWith("retag-auth="));
                const auth = setCookies[0].split("=")[1].split(";")[0];
                assert(auth.includes("."));
                resolve(auth);
            });
            req.write(body);
            req.end();
        });
    },
    getEndpoint: async (endpoint, auth = null, method = "GET", body) => {
        let headers = {};
        if (auth !== null) {
            headers["Cookie"] = `retag-auth=${auth}`;
        }
        const res = await fetch(module.exports.config["api-server"] + endpoint, {
            method, body, headers,
        });
        assert.equal(res.status, 200);
        return await res.text();
    },
};
