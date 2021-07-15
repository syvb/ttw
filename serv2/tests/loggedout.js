module.exports = async () => {
    const assert = require("assert").strict;
    const fetch = require("node-fetch");
    const { config, getEndpoint } = require("./util.js");

    const root = await getEndpoint("/");
    assert(root.endsWith('">TagTime Web</a> backend. You are logged out.'));

    assert((await fetch(config["api-server"] + "/.well-known/change-password")).redirected);
    assert((await fetch(config["api-server"] + "/internal/gentoken")).redirected);
    assert((await fetch(config["api-server"] + "/internal/changepw")).redirected);
};
