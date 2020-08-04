const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};

module.exports = function setCorsHeaders(res) {
    res.header("Access-Control-Allow-Origin", config["root-domain"]);
    res.header("Access-Control-Allow-Methods", "GET, PATCH, PUT, DELETE");
    res.header("Access-Control-Allow-Credentials", "true")
    res.header("Access-Control-Allow-Headers", "content-type")
    res.header("Access-Control-Max-Age", config["prod"] ? "86400" : "5");
};
