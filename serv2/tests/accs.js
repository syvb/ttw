module.exports = async () => {
    const assert = require("assert").strict;
    const { createAcc, getEndpoint } = require("./util.js")

    const token = await createAcc("normalacc");
    const root = await getEndpoint("/", token);
    assert(root.includes('">TagTime Web</a> backend. You are logged in, your user ID is'));
    assert(root.endsWith(', and your username is normalacc.'));
    await createAcc("z");
    await createAcc("abcdeabcdeabcde");
    await createAcc("sOmEwHaTuPpEr");
    await createAcc("rst_twtw", "supersecret123", false);
    await createAcc("rst$twtw", "supersecret123", false);
    await createAcc("_rsttwtw", "supersecret123", false);
    await createAcc("(rsttwtw", "supersecret123", false);
    await createAcc("nullbyte", "trstrsstx\x00ysrtrstrs", false);
    await createAcc("shortpw", "a", false);
};
