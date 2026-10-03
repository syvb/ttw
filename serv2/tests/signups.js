module.exports = async config => {
    const assert = require("assert").strict;
    const fetch = require("node-fetch");
    const { createAcc } = require("./util.js");

    const body = "pw=supersecret123&pw2=supersecret123&username=nosignup&email=nosignup@example.com";
    config["disable-signups"] = true;
    const getRes = await fetch(config["api-server"] + "/internal/register");
    assert.equal(getRes.status, 403);
    const postRes = await fetch(config["api-server"] + "/internal/register", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        redirect: "manual",
    });
    assert.equal(postRes.status, 403);
    assert.equal(postRes.headers.get("set-cookie"), null);

    // the other tests need to create accounts, so leave signups enabled regardless of config.json
    config["disable-signups"] = false;
    // the username wasn't taken by the blocked signup
    await createAcc("nosignup");
};
