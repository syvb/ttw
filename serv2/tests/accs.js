module.exports = async () => {
    const assert = require("assert").strict;
    const fetch = require("node-fetch");
    const { createAcc } = require("./util.js")

    await createAcc("normalacc");
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
