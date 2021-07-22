if (process.env["SERV2_TEST_MODE"]) {
    process.on("unhandledRejection", up => { throw up });
}

const express = require("express");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const argon2 = require("argon2");
const cookieParser = require("cookie-parser");
const { shouldSendSameSiteNone } = require("should-send-same-site-none");
const fs = require("fs");
const crypto = require("crypto");
const util = require("util");
const https = require("https");

const beem = require("./beem")(authMiddleware);
const validate = require("./validate");
const pushHandler = require("./pushHandler");
const setCorsHeaders = require("./setCorsHeaders");
const taglogic = require("./pkg/taglogic.js");
const config = {
    ...require("../config.json"),
    ...require("../config-private.json")
};
const USER_DB_SETUP = fs.readFileSync(__dirname + "/initUserDb.sql", "utf-8");
const USER_DB_EMPTY = fs.readFileSync(__dirname + "/emptyUserDb.sql", "utf-8");

const USER_DB_DIR =
    (config["user-db-dir"] ? config["user-db-dir"] : (__dirname + "/user-dbs")) +
    (process.env["SERV2_TEST_MODE"] ? "/test" : "");

if (!fs.existsSync(USER_DB_DIR)) {
    fs.mkdirSync(USER_DB_DIR);
}

const ARGON2_CONFIG = {
    type: argon2.argon2id,
    memoryCost: 500000,
    hashLength: 40,
    parallelism: 2,
    timeCost: 3,
    version: 0x13,
};

const globalDb = new Database(process.env["SERV2_TEST_MODE"] ? ":memory:" : "global.db");
globalDb.exec(fs.readFileSync(__dirname + "/initGlobalDb.sql", "utf-8"));
const authDb = new Database(process.env["SERV2_TEST_MODE"] ? ":memory:" : "auth.db");
authDb.exec(fs.readFileSync(__dirname + "/initAuthDb.sql", "utf-8"));
try {
    globalDb.exec("ALTER TABLE pushregs ADD COLUMN alg DEFAULT 0");
    console.log("Upgraded DB");
} catch (e) {}
const globalPreped = {
    emailCheck: globalDb.prepare("SELECT 1 FROM emails WHERE LOWER(email) = LOWER(?) AND verified = 1 LIMIT 1"),
    usernameCheck: globalDb.prepare("SELECT id FROM users WHERE username = ? LIMIT 1"),
    register: globalDb.prepare("INSERT INTO users (username, pw, register_date, plan) VALUES (@username, @pw, @register_date, 1)"),
    registerEmail: globalDb.prepare("INSERT INTO emails (user_id, email, token, verified) VALUES (@user_id, @email, @token, 0)"),
    // it used to be possible to register multiple accounts with the same name
    login: globalDb.prepare("SELECT id, pw FROM users WHERE username = ? ORDER BY id LIMIT 1"),
    changePw: globalDb.prepare("UPDATE users SET pw = @pw WHERE id = @uid"),
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
const authPrepped = {
    create: authDb.prepare("INSERT INTO tokens(user_id, token_data, created) VALUES (@uid, @token, @now)"),
    invalidateAll: authDb.prepare("DELETE from tokens WHERE user_id = ?"),
    invalidate: authDb.prepare("DELETE from tokens WHERE token_data = ?"),
    invalidateApi: authDb.prepare("DELETE from tokens WHERE user_id = ? AND token_data LIKE 'api!%'"),
    checkToken: authDb.prepare("SELECT user_id FROM tokens WHERE token_data = ?"),
}

function getUserDb(id) {
    return new Database(`${USER_DB_DIR}/${id.toString(36)}.db`);;
}

async function setAuthCookie(res, uid) {
    const randomToken = (await util.promisify(crypto.randomBytes)(192)).toString("base64").replace(/=/g, "");
    let cookie = `${uid.toString(36)}.${randomToken}`;
    authPrepped.create.run({
        now: Date.now(),
        token: cookie,
        uid,
    });
    const cookieData = {
        maxAge: 86400000 * 365, // 1 year
        httpOnly: true,
        secure: !!config["secure-cookie"],
    };
    if (config["cookie-domain"]) {
        cookieData.domain = config["cookie-domain"];
        cookieData.sameSite = "Lax";
    } else {
        cookieData.sameSite = "None";
    }
    res.cookie("retag-auth", cookie, cookieData);
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
    const authHeader = req.header("Authorization");
    let dbInfo = null;
    if (authHeader) {
        const tokenMatches = authHeader.match(/Bearer ttwprivate_(.+)/);
        if (tokenMatches) {
            const token = tokenMatches[1];
            dbInfo = authPrepped.checkToken.get(token);
        }
    } else {
        if ((typeof req.cookies["retag-auth"]) !== "string") {
            req.authUser = null;
            return next();
        }
        dbInfo = authPrepped.checkToken.get(req.cookies["retag-auth"]);
    }
    if (!dbInfo) {
        req.authUser = null;
        res.clearCookie("retag-auth");
        return next();
    }
    req.authUser = dbInfo.user_id;
    next();
}

app.get("/", authMiddleware, (req, res) => {
    let authInfo;
    if (req.authUser) {
        // usernames can only have HTML-safe characters
        const username = globalPreped.uidUsername.get(req.authUser).username;
        authInfo = `You are logged in, your user ID is ${req.authUser}, and your username is ${username}.`;
    } else {
        authInfo = "You are logged out."
    }
    res.send(`This is the <a href="${config["root-domain"]}">${config["app-name"] || "TagTime Web"}</a> backend. ${authInfo}`);
});

const formsScript = fs.readFileSync(__dirname + "/forms/forms.js", "utf-8");
app.get("/internal/forms.js", (req, res) => {
    res.contentType("text/javascript");
    res.send(formsScript);
});

const registerForm = fs.readFileSync(__dirname + "/forms/register.html", "utf-8");
function registerFormWithError(error) {
    return registerForm.replace(/%main%/g, config["root-domain"]).replace(/%errors%/g, `<div class="error">${error}</div>`);
}
app.post("/internal/register", bodyParser.urlencoded({ extended: false, limit: config["db-max-size"] }), async (req, res) => {
    const pw = req.body.pw;
    if (typeof pw !== "string") {
        return res.status(400).send(registerFormWithError("No pw specified"));
    }
    const pwValidationMsg = validate.pw(pw);
    if (pwValidationMsg) return res.send(registerFormWithError(pwValidationMsg));
    const pw2 = req.body.pw2;
    if (typeof pw2 !== "string") {
        return res.status(400).send(registerFormWithError("No pw2 specified"));
    }
    if (pw !== pw2) return res.send(registerFormWithError("Passwords don't match"))

    let username = req.body.username;
    if (typeof username !== "string") {
        return res.status(400).send(registerFormWithError("No username specified"));
    }
    username = username.toLowerCase();
    const usernameValidationMsg = validate.username(username);
    if (usernameValidationMsg) return res.send(registerFormWithError(usernameValidationMsg));

    let email = req.body.email;
    if (typeof email !== "string") {
        return res.status(400).send(registerFormWithError("No email specified"));
    }
    email = email.toLowerCase();
    const emailValidationMsg = validate.email(email);
    if (emailValidationMsg) return res.send(registerFormWithError(emailValidationMsg));

    const [ emailToken, hashedPw ] = await Promise.all([
        util.promisify(crypto.randomBytes)(64),
        argon2.hash(pw, ARGON2_CONFIG), // automatically deals with salt
    ]);

    // do this right before we add the user to prevent dupe signups when double clicking signup
    const usernameCheck = globalPreped.usernameCheck.get(username);
    if (usernameCheck !== undefined) {
        return res.send(registerFormWithError("Username already exists"))
    }

    // we currently don't check emails so this is effectively a no-op for now
    const emailCheck = globalPreped.emailCheck.get(username);
    if (emailCheck !== undefined) {
        return res.send(registerFormWithError("Email already used. Try logging in."))
    }

    const uid = globalPreped.registerTx(emailToken.toString("base64"), hashedPw, email, username);
    const setCookiePromise = setAuthCookie(res, uid);
    const userDb = getUserDb(uid);
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
        return res.status(400).send(loginFormWithError("No pw specified"));
    }
    const pwValidationMsg = validate.pw(pw);
    if (pwValidationMsg) return res.send(loginFormWithError(pwValidationMsg));

    let username = req.body.username;
    if (typeof username !== "string") {
        return res.status(400).send(loginFormWithError("No username specified"));
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
    res.redirect(config["root-domain"] + "/app");
});

const changePwForm = fs.readFileSync(__dirname + "/forms/changepw.html", "utf-8");
function changePwFormWithError(req, error) {
    const username = globalPreped.uidUsername.get(req.authUser).username;
    return changePwForm.replace(/%errors%/g, `<div class="error">${error}</div>`).replace(/%main%/g, config["root-domain"]).replace(/%username%/g, username);
}
app.get("/internal/changepw", authMiddleware, (req, res) => {
    if (req.authUser === null) {
        res.redirect(302, "/internal/login");
        return;
    }
    const username = globalPreped.uidUsername.get(req.authUser).username;
    res.send(changePwForm.replace(/%errors%/g, "").replace(/%main%/g, config["root-domain"]).replace(/%username%/g, username));
});
app.post("/internal/changepw", authMiddleware, bodyParser.urlencoded({ extended: false, limit: config["db-max-size"] }), async (req, res) => {
    if (req.authUser === null) {
        // 302 since /internal/login should be GETed in this case
        res.redirect(302, "/internal/login");
        return;
    }

    const pw = req.body.pw;
    if (typeof pw !== "string") {
        return res.status(400).send(changePwFormWithError(req, "No pw specified"));
    }
    const pwValidationMsg = validate.pw(pw);
    if (pwValidationMsg) return res.send(changePwFormWithError(req, pwValidationMsg));

    const hashedPw = await argon2.hash(pw, ARGON2_CONFIG);
    globalPreped.changePw.run({
        pw: hashedPw,
        uid: req.authUser,
    });
    authPrepped.invalidateAll.run(req.authUser);
    res.redirect(302, "/internal/login");
});
app.get("/.well-known/change-password", (req, res) => {
    res.redirect(302, "/internal/changepw");
})

const gentokenForm = fs.readFileSync(__dirname + "/forms/gentoken.html", "utf-8");
app.get("/internal/gentoken", authMiddleware, (req, res) => {
    if (req.authUser === null) {
        res.redirect(302, "/internal/login");
        return;
    }
    const username = globalPreped.uidUsername.get(req.authUser).username;
    res.send(gentokenForm.replace(/%main%/g, config["root-domain"]).replace(/%username%/g, username));
});
app.post("/internal/gentoken", authMiddleware, async (req, res) => {
    if (req.authUser === null) {
        res.redirect(302, "/internal/login");
        return;
    }
    const uid = req.authUser;
    // use some extra bytes because cookie length doesn't matter here
    const randPromise = util.promisify(crypto.randomBytes)(256);
    authPrepped.invalidateApi.run(uid);
    const randomToken = (await randPromise).toString("base64").replace(/=/g, "");
    let token = `api!${uid.toString(36)}.${randomToken}`;
    authPrepped.create.run({
        now: Date.now(),
        token,
        uid,
    });
    const userToken = `ttwprivate_${token}`;
    res.type("text/plain");
    res.send(userToken);
});

app.post("/logout", authMiddleware, (req, res) => {
    if (req.authUser !== null) {
        authPrepped.invalidate.run(req.cookies["retag-auth"]);
    }
    res.clearCookie("retag-auth");
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
    const userDb = getUserDb(req.authUser);
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
    const userDb = getUserDb(req.authUser);
    let getStmt;
    if (req.query.merge) {
        getStmt = userDb.prepare("SELECT tags FROM pings WHERE time = @time");
    }
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
            if (ping.time > (Date.now() + 45000)) return "Your clock is ahead, please ensure your system time is valid.";
            if (req.query.merge) {
                const cur = getStmt.get({ time: ping.time });
                if (cur) {
                    const tags = new Set([...ping.tags, ...cur.tags.split(" ")]);
                    ping.tags = [...tags];
                }
            }
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
    const goalsData = userDb.prepare("SELECT k, v FROM meta WHERE k IN ('retag-beem-token', 'retag-goals')").all();
    const beeToken = goalsData.filter(({ k }) => k === "retag-beem-token")[0];
    const beeGoals = goalsData.filter(({ k }) => k === "retag-goals")[0];
    if (beeToken && beeGoals) beem.pingsUpdated(json.pings, beeToken.v, beeGoals.v, req.authUser);
    if (txErr) return res.status(400).send(txErr);
    res.status(200).json({
        latestUpdate: now,
    });
});
app.options("/pings", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    res.send();
});

app.get("/pings/expected/:from/:to", authMiddleware, (req, res) => {
    if (req.authUser === null) return res.status(403).send();
    const from = parseInt(req.params.from, 10);
    const to = parseInt(req.params.to, 10);
    if (Number.isNaN(from)) return res.status(400).send("from is not a number");
    if (Number.isNaN(to)) return res.status(400).send("to is not a number");
    if (from < 0) return res.status(400).send("from is negative");
    if (to < 0) return res.status(400).send("to is negative");
    if (from > 4294967295) return res.status(400).send("from is too big");
    if (to > 4294967295) return res.status(400).send("to is too big");
    if (from >= to) return res.status(400).send("to must be after from, try reversing the arguments");
    // give 100 seconds of leeway
    if ((to - from) > 86500) return res.status(400).send("gap is bigger than 86400 seconds")

    const userDb = getUserDb(req.authUser);
    const stmt = userDb.prepare("SELECT k, v FROM meta WHERE k IN ('retag-pint-alg', 'retag-pint-interval', 'retag-pint-seed')");
    let pintData = Object.create(null);
    stmt.all().forEach(({ k, v }) => pintData[k] = v);
    const alg = (pintData["retag-pint-alg"] === "tagtime" || pintData["retag-pint-alg"] === "fnv") ? pintData["retag-pint-alg"] : "fnv";
    let interval = pintData["retag-pint-interval"];
    if (interval) {
        interval = parseInt(interval, 10);
        if (Number.isNaN(interval) || interval < 1 || interval >= 2147483647) {
            interval = 2700;
        }
    } else {
        interval = 2700;
    }
    if (interval < 60) return res.status(400).send("interval must be at least a minute to use this endpoint");
    let seed = pintData["retag-pint-seed"];
    if (seed) {
        seed = parseInt(seed, 10);
        if (Number.isNaN(seed) || seed < 1 || seed >= 2147483647) {
            seed = 12345;
        }
    } else {
        seed = 12345;
    }
    if (alg === "tagtime") {
        return res.status(400).send("using tagtime alg is not currently supported");
    }
    const pint = taglogic.new_ping_interval_data(seed, interval, alg === "tagtime");
    const between = taglogic.pings_between_u32(from, to, pint);
    res.status(200).send([...between]);
});

app.get("/config", authMiddleware, (req, res) => {
    setCorsHeaders(res);
    if (req.authUser === null) return res.status(403).send();
    const userDb = getUserDb(req.authUser);
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
    const userDb = getUserDb(req.authUser);
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
    const userDb = getUserDb(req.authUser);
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
    const userDb = getUserDb(req.authUser);
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

app.use("/internal/beem", beem.router);

if (config["https-crt"]) {
    const httpsConfig = {
        key: fs.readFileSync(config["https-key"]),
        cert: fs.readFileSync(config["https-crt"]),
    };
    if (config["https-ca"]) {
        httpsConfig.ca = fs.readFileSync(config["https-ca"]);
    }
    const server = https.createServer(httpsConfig, app);
    server.listen(config["api-listen-port"]);
} else {
    app.listen(config["api-listen-port"]);
}

if (process.env["SERV2_TEST_MODE"]) {
    (async () => {
        await require("./tests/pings.js")();
        await require("./tests/loggedout.js")();
        await require("./tests/accs.js")();
        process.exit(0);
    })();
}
