const assert = require("assert").strict;
const normalizePath = require("../static/normalizePath");

module.exports = async () => {
    assert.equal(normalizePath("./index.html"), "");
    assert.equal(normalizePath("/graphs/index.html"), "app");
    assert.equal(normalizePath("/graphs/"), "app");
    assert.equal(normalizePath("/graphs"), "app");
    assert.equal(normalizePath("graphs/index.html"), "app");
    assert.equal(normalizePath("graphs/"), "app");
    assert.equal(normalizePath("graphs"), "app");
};
