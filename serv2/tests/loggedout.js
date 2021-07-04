module.exports = async () => {
    const assert = require("assert").strict;
    const fetch = require("node-fetch");
    const config = {
        ...require("../../config.json"),
        ...require("../../config-private.json")
    };
    async function getEndpoint(endpoint) {
        const res = await fetch(config["api-server"] + endpoint);
        assert.equal(res.status, 200);
        return await res.text();
    }

    const root = await getEndpoint("/");
    assert(root.endsWith('">TagTime Web</a> backend. You are logged out.'));

    assert((await fetch(config["api-server"] + "/.well-known/change-password")).redirected);
    assert((await fetch(config["api-server"] + "/internal/gentoken")).redirected);
    assert((await fetch(config["api-server"] + "/internal/changepw")).redirected);
};
