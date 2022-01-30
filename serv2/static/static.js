// Catch-all route to serve static filePaths or 404

const fs = require("fs");
const normalizePath = require("./normalizePath");
const config = {
    ...require("../../config.json"),
    ...require("../../config-private.json")
};

const staticPath = `${__dirname}/../../web/dist`;

const staticFiles = Object.create(null);
let filePaths = [];
let mediaPaths = [];
try {
    let list = fs.readdirSync(staticPath);
    filePaths = filePaths.concat(list.filter(ele => ele.includes(".")));
    for (let subdir of list.filter(ele => !ele.includes("."))) {
        filePaths = filePaths.concat(fs.readdirSync(`${staticPath}/${subdir}`).map(ele => `${subdir}/${ele}`));
    }
    mediaPaths = fs.readdirSync(`${staticPath}/../media`);
} catch (e) {
    console.warn("WARN: failed to load all static file paths", e);
}
for (let path of filePaths) {
    if (path.endsWith(".template")) continue;
    staticFiles[normalizePath(path)] = fs.readFileSync(`${staticPath}/${path}`);
}
for (let path of mediaPaths) {
    staticFiles[normalizePath("media/" + path)] = fs.readFileSync(`${staticPath}/../media/${path}`);
}

const MIMES = {
    "css": "text/css",
    "svg": "image/svg+xml",
    "wasm": "application/wasm",
    "webmanifest": "application/manifest+json",
    "txt": "text/plain",
    "png": "image/png",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
};

module.exports = (req, res, next) => {
    if (config["static-from-backend"]) {
        const path = normalizePath(req.path);
        const staticFile = staticFiles[path];
        if (staticFile) {
            const parts = path.split(".");
            const mime = MIMES[parts[parts.length - 1]];
            if (mime) {
                res.contentType(mime);
            } else {
                res.contentType("text/html");
            }
            res.send(staticFile);
            return;
        }
    }
    res.status(404).send("Not found :(")
};
