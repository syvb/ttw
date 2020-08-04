const express = require("express");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const argon2 = require("argon2");
const cookieParser = require("cookie-parser");
const { shouldSendSameSiteNone } = require("should-send-same-site-none");
const fs = require("fs");
const fsP = require("fs").promises;
const crypto = require("crypto");
const util = require("util");

const validate = require("./validate");
const pushHandler = require("./pushHandler");
const setCorsHeaders = require("./setCorsHeaders");
const { start } = require("repl");
const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};
const USER_DB_SETUP = fs.readFileSync(__dirname + "/initUserDb.sql", "utf-8");
const USER_DB_EMPTY = fs.readFileSync(__dirname + "/emptyUserDb.sql", "utf-8");

const USER_DB_DIR = config["user-db-dir"] ? config["user-db-dir"] : (__dirname + "/user-dbs");

const ARGON2_CONFIG = {
    type: argon2.argon2id,
    memoryCost: 500000,
    hashLength: 40,
    parallelism: 2,
    timeCost: 3,
    version: 0x13,
};

let loggedOutTokens = [];
if (fs.existsSync(__dirname + "/logged-out-tokens.txt")) {
    loggedOutTokens = fs.readFileSync(__dirname + "/logged-out-tokens.txt", "utf-8")
        .split("\n")
        .filter(l => l.length >= 2);
} else {
    fs.writeFileSync(__dirname + "/logged-out-tokens.txt", "", "utf-8");
}
const globalDb = new Database("global.db");
globalDb.exec(fs.readFileSync(__dirname + "/initGlobalDb.sql", "utf-8"));
const globalPreped = {
    emailCheck: globalDb.prepare("SELECT 1 FROM emails WHERE LOWER(email) = LOWER(?) AND verified = 1 LIMIT 1"),
    usernameCheck: globalDb.prepare("SELECT 1 FROM users WHERE username = ? LIMIT 1"),
    register: globalDb.prepare("INSERT INTO users (username, pw, register_date, plan) VALUES (@username, @pw, @register_date, 1)"),
    registerEmail: globalDb.prepare("INSERT INTO emails (user_id, email, token, verified) VALUES (@user_id, @email, @token, 0)"),
    login: globalDb.prepare("SELECT id, pw FROM users WHERE username = ?"),
    uidUsername: globalDb.prepare("SELECT username FROM users WHERE id = ?"),
    registerTx: globalDb.transaction((emailToken, hashedPw, email, username) => {
        const { lastInsertRowid } = globalPreped.register.run({
            pw: hashedPw,
            register_date: Date.now(),
            username,
        });
        globalPreped.registerEmail.run({
            user_id: lastInsertRowid,
            email,
            token: emailToken,
        });
        return lastInsertRowid;
    })
};

async function setAuthCookie(res, uid) {
    const randomToken = (await util.promisify(crypto.randomBytes)(256)).toString("base64").replace(/=/g, "");
    let cookie = `${uid.toString(36)}.${randomToken}`;
    const hmac = crypto.createHmac("sha256", config["cookie-secret"]);
    hmac.update(cookie);
    cookie += `.${hmac.digest("base64")}`;
    res.cookie("retag-auth", cookie, {
        maxAge: 86400000 * 365, // 1 year
        httpOnly: true,
        sameSite: "None",
    });
}

const app = express();
app.set("query parser", "simple");
app.use(shouldSendSameSiteNone); // fixes browsers that don't respect SameSite=None
app.use(cookieParser(config["cookie-secret"]));
app.use((req, res, next) => {
    res.header("X-Frame-Options", "deny");
    res.header("Content-Security-Policy", "default-src 'self'")
    next();
})
function authMiddleware(req, res, next) {
    if ((typeof req.cookies["retag-auth"]) !== "string") {
        req.authUser = null;
        return next();
    }
    const authParts = req.cookies["retag-auth"].split(".");
    if (authParts.length !== 3) {
        req.authUser = null;
        res.clearCookie("retag-auth");
        return next();
    }
    const uid = parseInt(authParts[0], 36);
    if (Number.isNaN(uid)) {
        req.authUser = null;
        res.clearCookie("retag-auth");
        return next();
    }
    if (loggedOutTokens.includes(authParts[1])) {
        req.authUser = null;
        res.clearCookie("retag-auth");
        return next();
    }
    const hmac = crypto.createHmac("sha256", config["cookie-secret"]);
    hmac.update(`${authParts[0]}.${authParts[1]}`);
    const digest = hmac.digest("base64");
    if (digest !== authParts[2]) {
        req.authUser = null;
        res.clearCookie("retag-auth");
        return next();
    }
    req.authUser = uid;
    req.authToken = authParts[1];
    next();
}

app.get("/", (req, res) => {
    res.send("This is the TagTimeWeb backend.");
});

const registerForm = fs.readFileSync(__dirname + "/forms/register.html", "utf-8");
function registerFormWithError(error) {
    return registerForm.replace(/%main%/g, config["root-domain"]).replace(/%errors%/g, `<div class="error">${error}</div>`);
}
app.post("/internal/register", bodyParser.urlencoded({ extended: false, limit: config["db-max-size"] }), async (req, res) => {
    const pw = req.body.pw;
    if (typeof pw !== "string") {
        return res.status(400).body(registerFormWithError("No pw specified"));
    }
    const pwValidationMsg = validate.pw(pw);
    if (pwValidationMsg) return res.send(registerFormWithError(pwValidationMsg));
    const pw2 = req.body.pw2;
    if (typeof pw2 !== "string") {
        return res.status(400).body(registerFormWithError("No pw2 specified"));
    }
    if (pw !== pw2) return res.send(registerFormWithError("Passwords don't match"))

    let username = req.body.username;
    if (typeof username !== "string") {
        return res.status(400).body(registerFormWithError("No username specified"));
    }
    username = username.toLowerCase();
    const usernameValidationMsg = validate.username(username);
    if (usernameValidationMsg) return res.send(registerFormWithError(usernameValidationMsg));

    let email = req.body.email;
    if (typeof email !== "string") {
        return res.status(400).body(registerFormWithError("No email specified"));
    }
    email = email.toLowerCase();
    const emailValidationMsg = validate.email(email);
    if (emailValidationMsg) return res.send(registerFormWithError(emailValidationMsg));

    const usernameCheck = globalPreped.usernameCheck.get(username);
    if (usernameCheck !== undefined) {
        return res.send(registerFormWithError("Username already exists"))
    }

    const emailCheck = globalPreped.emailCheck.get(username);
    if (emailCheck !== undefined) {
        return res.send(registerFormWithError("Email already used. Try logging in."))
    }

    const [ emailToken, hashedPw ] = await Promise.all([
        util.promisify(crypto.randomBytes)(256),
        argon2.hash(pw, ARGON2_CONFIG), // automatically deals with salt
    ]);
    const uid = globalPreped.registerTx(emailToken.toString("base64"), hashedPw, email, username);
    const setCookiePromise = setAuthCookie(res, uid);
    const userDb = new Database(`${USER_DB_DIR}/${uid.toString(36)}.db`);
    userDb.exec(USER_DB_SETUP);
    userDb.pragma("page_size = 4096");
    userDb.pragma(`max_page_count = ${Math.floor(config["db-max-size"] / 4096)}`);
    await setCookiePromise;
    res.redirect(config["root-domain"] + "/welcome");
});
app.get("/internal/register", (req, res) => {
    res.send(registerForm.replace(/%errors%/g, "").replace(/%main%/g, config["root-domain"]));
});

const loginForm = fs.readFileSync(__dirname + "/forms/login.html", "utf-8");
function loginFormWithError(error) {
    return loginForm.replace(/%errors%/g, `<div class="error">${error}</div>`).replace(/%main%/g, config["root-domain"]);
}
app.get("/internal/login", (req, res) => {
    res.send(loginForm.replace(/%errors%/g, "").replace(/%main%/g, config["root-domain"]));
});
app.post("/internal/login", bodyParser.urlencoded({ extended: false, limit: config["db-max-size"] }), async (req, res) => {
    const pw = req.body.pw;
    if (typeof pw !== "string") {
        return res.status(400).body(loginFormWithError("No pw specified"));
    }
    const pwValidationMsg = validate.pw(pw);
    if (pwValidationMsg) return res.send(loginFormWithError(pwValidationMsg));

    let username = req.body.username;
    if (typeof username !== "string") {
        return res.status(400).body(loginFormWithError("No username specified"));
    }
    username = username.toLowerCase();
    const usernameValidationMsg = validate.username(username);
    if (usernameValidationMsg) return res.send(loginFormWithError(usernameValidationMsg));

    const dbData = globalPreped.login.get(username);
    if (!dbData) {
        return res.send(loginFormWithError("Username not found"));
    }

    const valid = await argon2.verify(dbData.pw, pw);
    if (!valid) return res.send(loginFormWithError("Incorrect password"));

    await setAuthCookie(res, dbData.id);
    res.redirect(config["root-domain"]);
});

app.post("/logout", authMiddleware, (req, res) => {
    res.clearCookie("retag-auth");
    if (req.authUser !== null) {
        loggedOutTokens.push(req.authToken);
        // don't wait for the writing to complete, since the updated token list is stored in memory
        fsP.writeFile(__dirname + "/logged-out-tokens.txt", loggedOutTokens.join("\n"), "utf-8");
    }
    res.redirect(config["root-domain"]);
});

const FORMS_STYLE = fs.readFileSync(__dirname + "/forms/style.css");
app.get("/internal/style.css", (req, res) => {
    res.type("text/css");
    res.send(FORMS_STYLE);
});

app.get("/me.json", authMiddleware, (req, res) => {
    res.json({
        uid: req.authUser,
    });
});

function getUserConfig(userDb) {
    const configStmt = userDb.prepare("SELECT k, v FROM meta");
    const configRaw = configStmt.all();
    let parsedConfig = {};
    configRaw.forEach(({ k, v }) => parsedConfig[k] = v);
    return parsedConfig;
}

// params:
// ?editedAfter=X - last modified after specified date
// ?startTime=X - time before X
// ?endTime=X - time after X
// ?limit - limit to most recent X pings
app.get("/pings", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    let editedAfter = null;
    if ((typeof req.query.editedAfter) === "string") {
        editedAfter = parseInt(req.query.editedAfter, 10);
        if (Number.isNaN(editedAfter)) editedAfter = null;
    }
    let startTime = null;
    if ((typeof req.query.startTime) === "string") {
        startTime = parseInt(req.query.startTime, 10);
        if (Number.isNaN(startTime)) startTime = null;
    }
    let endTime = null;
    if ((typeof req.query.endTime) === "string") {
        endTime = parseInt(req.query.endTime, 10);
        if (Number.isNaN(endTime)) endTime = null;
    }
    let limit = null;
    if ((typeof req.query.limit) === "string") {
        limit = parseInt(req.query.limit, 10);
        if (Number.isNaN(limit)) limit = null;
    }
    let clauses = [];
    if (editedAfter) clauses.push("last_change > @editedAfter");
    if (startTime) clauses.push("time >= @startTime");
    if (endTime) clauses.push("time <= @endTime");
    const wherePart = `${clauses.length > 0 ? " WHERE " : ""}${clauses.join(" AND ")}`;
    const limitPart = (limit === null) ? "" : " ORDER BY time DESC LIMIT @limit";
    const stmtText =
        `SELECT time, tags, interval, category, comment, last_change FROM pings${wherePart}${limitPart}`;
    const stmt = userDb.prepare(stmtText);
    const rows = stmt.all({ editedAfter, startTime, endTime, limit });  
    let latestUpdate = rows.reduce((prev, current) => (prev.last_change > current.last_change) ? prev : current, { last_change: 1 }).last_change;
    // more than 2ms since the latest update time?
    // no risk of another update in the same millisecond of the last update,
    // so add two to stop sending that again
    if ((Date.now() - latestUpdate) > 3) latestUpdate += 2;
    if (req.query.no204 ? false : (rows.length === 0 && (editedAfter !== null) && (startTime === null) && (endTime === null))) {
        res.status(204).send();
        return;
    }
    const username = globalPreped.uidUsername.get(req.authUser).username;
    res.json({
        pings: rows.map(row => ({
            ...row,
            tags: (row.tags.length === 0) ? [] : row.tags.split(" ")
        })),
        config: getUserConfig(userDb),
        latestUpdate: Math.max(latestUpdate, editedAfter), // null is corerced into 0
        username,
    });
});
app.patch("/pings", authMiddleware, bodyParser.text({ limit: config["db-max-size"] }), (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    let json;
    try {
        json = JSON.parse(req.body);
    } catch (e) {
        return res.status(400).send("Invalid JSON");
    }
    if (!Array.isArray(json.pings)) {
        return res.status(400).send("pings must be an array");
    }
    if (json.pings.length < 1) return res.status(400).send("Must modify at least 1 ping.");
    const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    const stmt = userDb.prepare("INSERT OR REPLACE INTO pings (time, tags, interval, category, comment, last_change) VALUES (@time, @tags, @interval, @category, @comment, @last_change)");
    const now = Date.now();
    const tx = userDb.transaction(() => {
        for (let i = 0; i < json.pings.length; i++) {
            const ping = json.pings[i];
            if (!(ping.comment === null || (typeof ping.comment === "string"))) return "invalid comment";
            if (!(ping.category === null || (typeof ping.category === "string"))) return "invalid category";
            if (!Array.isArray(ping.tags) || ping.tags.find(tag => typeof tag !== "string") !==  undefined) return "invalid tags";
            if (typeof ping.time !== "number") return "invalid time";
            if (typeof ping.interval !== "number") return "invalid interval";
            stmt.run({
                tags: ping.tags.join(" "),
                comment: ping.comment,
                category: ping.category,
                time: ping.time,
                interval: ping.interval,
                last_change: now,
            });
        }
        return false;
    });
    const txErr = tx();
    if (txErr) return res.status(400).send(txErr);
    res.status(200).json({
        latestUpdate: now,
    });
});
app.options("/pings", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    res.send();
});

app.get("/config", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    res.json(getUserConfig(userDb));
});
app.patch("/config", authMiddleware, bodyParser.text({ limit: config["db-max-size"] }), (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    let json;
    try {
        json = JSON.parse(req.body);
    } catch (e) {
        return res.status(400).send("Invalid JSON");
    }
    if (typeof json.changes !== "object") {
        return res.status(400).send("Must be an object");
    }
    if (typeof json.changes.lastModified !== "number") {
        return res.status(400).send("changes.lastModified must be a number");
    }
    const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    const modifyCheckStmt = userDb.prepare("SELECT v FROM meta WHERE k = 'lastModified'");
    let lastModified = modifyCheckStmt.get();
    if (lastModified === undefined) {
        lastModified = -Infinity;
    } else {
        lastModified = lastModified.v;
    }
    if (json.changes.lastModified < lastModified) {
        return res.status(200).json({
            reload: true,
        });
    }
    const entries = Object.entries(json.changes);
    const stmt = userDb.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)");
    const tx = userDb.transaction(() => {
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (typeof entry[0] !== "string") return "Keys must be strings";
            if (!((typeof entry[1] === "string") || (typeof entry[1] === "number"))) return "Values must be strings";
            stmt.run(entry[0], entry[1]);
        }
        return false;
    });
    const txErr = tx();
    if (txErr) return res.status(400).send(txErr);
    res.status(204).send();
});
app.options("/config", (req, res) => {
    setCorsHeaders(res);
    res.send();
});

app.get("/db", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    const stream = fs.createReadStream(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    res.attachment("user.db");
    stream.pipe(res);
});
app.delete("/db", authMiddleware, (req, res) => {
    if (req.authUser === null) return res.status(403).send();
    setCorsHeaders(res);
    const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    const tx = userDb.transaction(() => {
        userDb.exec(USER_DB_EMPTY);
        userDb.exec(USER_DB_SETUP);
    });
    tx();
    userDb.prepare("PRAGMA optimize").get();
    userDb.prepare("VACUUM").run();
    res.status(204).send();
});
app.options("/db", (req, res) => {
    setCorsHeaders(res);
    res.send();
});

app.get("/internal/mini-data", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    const userDb = new Database(`${USER_DB_DIR}/${req.authUser.toString(36)}.db`);
    // send just over 1 day of tags on default schedule
    // should be quite compressable
    const pingsStmt = userDb.prepare("SELECT * FROM pings ORDER BY time DESC LIMIT 50");
    const pings = pingsStmt.all().map(row => ({
        ...row,
        tags: (row.tags.length === 0) ? [] : row.tags.split(" ")
    }));
    const pingsMeta = userDb.prepare("SELECT COUNT(*), MAX(last_change) FROM pings").get();
    const totalPings = pingsMeta["COUNT(*)"];
    let latestUpdate = pingsMeta["MAX(last_change)"]
    if ((Date.now() - latestUpdate) > 3) latestUpdate += 2;
    const username = globalPreped.uidUsername.get(req.authUser).username;
    const config = getUserConfig(userDb);
    res.json({
        pings,
        totalPings,
        username,
        config,
        latestUpdate,
    });
});
app.options("/internal/mini-data", (req, res) => {
    setCorsHeaders(res);
    res.send();
});

app.use("/internal/push", pushHandler(globalDb));

app.listen(config["api-listen-port"]);
