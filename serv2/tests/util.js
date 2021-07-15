// utilities for tests

const fetch = require("node-fetch");
const assert = require("assert").strict;

module.exports = {
    config: {
        ...require("../../config.json"),
        ...require("../../config-private.json")
    },
    getEndpoint: async (endpoint, method = "GET", body) => {
        const res = await fetch(module.exports.config["api-server"] + endpoint, {
            method, body,
        });
        assert.equal(res.status, 200);
        return await res.text();
    },
};
