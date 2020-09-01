// @ts-ignore
import { updateTagIndexWithPings, rebuildTagIndex } from "./tagIndex.ts";
// @ts-ignore
import { unsub } from "./push.ts";
// @ts-ignore
import { unsyncedPings, putPings, Ping } from "./pings.ts";
//@ts-ignore
import { backend, FULL_BACKEND, MINI_BACKEND } from "./backend.ts";
const config = require("../config.json");

let lastPingCheck = (typeof localStorage === "undefined") ? null : (localStorage["retag-last-sync-time"] || null);

function getConfigData() {
    return JSON.stringify({
        ver: 1,
    });
}

interface ConfigData {
    ver: string,
}

function loadConfigData(json: ConfigData) {
    console.log("Config ver", json.ver);
    if (json.ver !== "1") {
        console.warn("Using outdated config!");
        if (location.pathname !== "/welcome") {
            location.reload();
        }
        return;
    }
    let reload = false;
    const interval = json["retag-pint-interval"] ?? (60 * 45).toString();
    const seed = json["retag-pint-seed"] ?? "12345";
    const alg = json["retag-pint-alg"] ?? "fnv";
    if (localStorage["retag-pint-interval"] !== interval) {
        localStorage["retag-pint-interval"] = parseInt(interval, 10);
        reload = true;
    }
    if (localStorage["retag-pint-seed"] !== seed) {
        localStorage["retag-pint-seed"] = parseInt(seed, 10);
        reload = true;
    }
    if (localStorage["retag-pint-alg"] !== alg) {
        // if it's undefined then it's the same as fnv, no need to reload
        if (!((localStorage["retag-pint-alg"] === undefined) && (alg === "fnv"))) {
            reload = true;
        }
        localStorage["retag-pint-alg"] = alg;
    }
    const afkTags = json["retag-afk-tags"] ?? "afk";
    localStorage["retag-afk-tags"] = afkTags;
    if (reload && (location.pathname !== "/welcome")) location.reload();
}

async function updateWithPingData(pings: Ping[], dbEmpty: boolean): Promise<void> {
    // This function blocks page load, so don't wait for the tag index to be updated.
    // Instead it is delayed a bit as to not use up CPU while the page loads.
    let anyNonNew = false;
    const filePromises = [];
    if (backend() === FULL_BACKEND) {
        pings.forEach(ping => {
            pings.push(ping);
            let filePromise: Promise<void>;
            if (anyNonNew) {
                filePromise = self.db.pings.put({ ...ping, unsynced: "n" });
            } else {
                filePromise = self.db.pings.get(ping.time).then((result: any) => {
                    if (result !== undefined) anyNonNew = true;
                    return self.db.pings.put({ ...ping, unsynced: "n" });
                });
            }
            filePromises.push(filePromise);
        });
        await Promise.all(filePromises);
        setTimeout(() => {
            if (anyNonNew) { // some pings changed
                rebuildTagIndex(); // just rebuild everything for now
            } else {
                updateTagIndexWithPings(pings);
            }
        }, 2000);
    } else if (backend() === MINI_BACKEND) {
        // we wiped the DB so it is safe to add and not put here
        if (dbEmpty) {
            await window.db.pings.bulkAdd(pings.map(ping => ({ ...ping, unsynced: "n" })));
        } else {
            await window.db.pings.bulkPut(pings.map(ping => ({ ...ping, unsynced: "n" })));
        }
        setTimeout(() => rebuildTagIndex(), 2000);
    }
    externalDbUpdate();
    if (self.recheckPending) self.recheckPending();
}

let polling = false;
let pendingConfigChanges = (typeof localStorage === "undefined") ? null : (localStorage["retag-pending-config-changes"] ? localStorage["retag-pending-config-changes"].split(" ") : []);
let pendingConfigChangesTime = (typeof localStorage === "undefined") ? null : (localStorage["retag-pending-config-changes-time"] ? parseInt(localStorage["retag-pending-config-changes-time"], 10) : null);

export async function syncConfig(changes = []) {
    if (typeof localStorage === "undefined") throw new Error("can't update config in worker");
    if (changes.length > 0) {
        pendingConfigChangesTime = Date.now();
        localStorage["retag-pending-config-changes-time"] = pendingConfigChangesTime;
    }
    localStorage["retag-pending-config-changes"] = pendingConfigChanges.toString();
    pendingConfigChanges = [...new Set(pendingConfigChanges.concat(changes))];
    if (pendingConfigChanges.length === 0) return;
    if (pendingConfigChangesTime === null) {
        pendingConfigChangesTime = Date.now();
        localStorage["retag-pending-config-changes-time"] = pendingConfigChangesTime;
    }
    localStorage["retag-pending-config-changes"] = pendingConfigChanges.join(" ");
    let configDataObj = {};
    pendingConfigChanges.forEach((key: string) => configDataObj[key] = localStorage[key]);
    let res: Response;
    let failed = false;
    try {
        res = await fetch(`${config["api-server"]}/config`, {
            method: "PATCH",
            mode: "cors",
            body: JSON.stringify({
                changes: {
                    ...configDataObj,
                    lastModified: pendingConfigChangesTime,
                }
            }),
            credentials: "include",
        });
    } catch (e) { failed = true; }
    if (!failed) {
        if (res.status === 204) {
            localStorage.removeItem("retag-pending-config-changes");
            localStorage.removeItem("retag-pending-config-changes-time");
            pendingConfigChanges = [];
            pendingConfigChangesTime = null;
            return;
        } else if (res.status === 200) {
            localStorage.removeItem("retag-pending-config-changes");
            localStorage.removeItem("retag-pending-config-changes-time");
            pendingConfigChanges = [];
            pendingConfigChangesTime = null;
            const body = await res.json();
            if (body.reload) location.href = "/";
            return;
        }
    }
    // didn't work, let's try again next call
}

let lastSyncPromise = Promise.resolve();
let dontSync = false;
export async function syncPings() {
    if (dontSync) return;
    await lastSyncPromise; // to avoid out-of-order writes being sent
    if (!self.db) {
        dontSync = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
        dontSync = false;
        return syncPings();
    }
    const promise: Promise<void> = new Promise(async (resolve, reject) => {
        let failed = false;
        const pings = await unsyncedPings();
        if (pings.length === 0) return resolve();
        let res: Response;
        try {
            res = await fetch(`${config["api-server"]}/pings`, {
                method: "PATCH",
                mode: "cors",
                body: JSON.stringify({
                    pings,
                }),
                credentials: "include",
            });
        } catch (e) { failed = true; }
        if (!failed) {
            if (res.status === 403) {
                // signed out
                if (typeof localStorage === "undefined") {
                    console.warn("Would force a log out but in a worker");
                }
                localStorage["retag-auth"] = "out";
                location.href = "/";
            }
            // once the server sends back the pings to us they will be marked as synced
        }
        resolve();
    });
    lastSyncPromise = promise;
    return promise; // flattened
}

function genPendingPromise() {
    const promise = (async () => (await db.pings.where("unsynced").equals("").first()) !== undefined)();
    promise.then((val) => {
        const event = new CustomEvent("pings-pending-sync-change", {
            detail: {
                anyPending: val,
            },
        });
        window.dispatchEvent(event);
    });
    return promise;
}
let anyPendingPromise;
export async function anyPending() {
    return await anyPendingPromise;
}

export async function externalDbUpdate() {
    anyPendingPromise = genPendingPromise();
}

function startCheckLoop() {
    polling = true;
    setInterval(async () => {
        let res;
        try {
            res = await fetch(`${config["api-server"]}/pings?editedAfter=${lastPingCheck}`, {
                mode: "cors",
                credentials: "include",
            });
        } catch (e) {
            // meh, we're offline
            return;
        }
        if (res.status === 200) {
            const data = await res.json();
            loadConfigData(data.config);
            updateWithPingData(data.pings, false);
            lastPingCheck = data.latestUpdate;
            localStorage["retag-last-sync-time"] = lastPingCheck;
        } else if (res.status === 403) {
            localStorage["retag-auth"] = "out";
            location.href = "/";
        } else if (res.status !== 204) {
            console.warn("Ignoring polling response", res);
        }
    }, 10000);
}

export async function checkLoginStateOnInit(): Promise<{ status: "in" | "out", username: string | null }> {
    let res: Response;
    let status: "in" | "out";
    let url: string;
    if (backend() === FULL_BACKEND) url = `${config["api-server"]}/pings?no204=1${!!lastPingCheck ? `&after=${lastPingCheck}` : ""}`;
    if (backend() === MINI_BACKEND) url = `${config["api-server"]}/internal/mini-data`;
    try {
        res = await fetch(url, {
            mode: "cors",
            credentials: "include",
        });
    } catch (e) {
        status = localStorage["retag-auth"] ?? "out"; // just return the cached value
    }
    let username = null;
    if (res) {
        if (res.status === 403) {
            status = "out";
        } else if (res.status === 200) {
            const data = await res.json();
            if (backend() === MINI_BACKEND) {
                localStorage["retag-mini-pings"] = data.totalPings;
                localStorage["retag-mini-missing"] = data.totalPings - data.pings.length;
                rebuildTagIndex(); // don't wait for it to finish
                // delete synced pings
                await window.db.pings.where("unsynced").equals("n").delete();
            }
            loadConfigData(data.config);
            // if there are some pending pings the DB won't be empty
            const dbEmpty = (await window.db.pings.count()) === 0;
            await updateWithPingData(data.pings, dbEmpty);
            rebuildTagIndex(); // don't wait for it to finish
            lastPingCheck = data.latestUpdate;
            localStorage["retag-last-sync-time"] = lastPingCheck;
            localStorage["retag-username"] = data.username;
            username = data.username;
            status = "in";
        } else {
            status = localStorage["retag-auth"] ?? "out"; // just return the cached value
        }
    }
    if (status === "out") {
        localStorage.removeItem("retag-last-sync-time");
        localStorage.removeItem("retag-pending-config-changes");
        localStorage.removeItem("retag-pending-config-changes-time");
        localStorage.removeItem("retag-username");
        localStorage.removeItem("retag-notifs");
        pendingConfigChanges = [];
        if (self.db) {
            self.db.pings.clear();
            self.db.tags.clear();
        }
        unsub();
    } else if (status === "in") {
        if (username === null) localStorage["retag-username"] ?? null;
        if (backend() === MINI_BACKEND) {
            window.miniData = {
                total: localStorage["retag-mini-pings"] ? parseInt(localStorage["retag-mini-pings"], 10) : 0,
                missing: localStorage["retag-mini-missing"] ? parseInt(localStorage["retag-mini-missing"], 10) : 0,
            };
        }
        startCheckLoop();
        setInterval(() => {
            // have some pings waiting to be sent? perhaps sending them will work now
            syncPings();
            // perhaps some config is pending?
            if (Object.keys(pendingConfigChanges).length > 0) syncConfig();
        }, 30000);
        window.addEventListener("online", e => {
            // back online! let's sync up
            syncPings();
        });
        if (Object.keys(pendingConfigChanges).length > 0) syncConfig();
        syncPings();
        anyPendingPromise = genPendingPromise();
    }
    if (status === "out" && location.pathname !== "/") {
        location.pathname = "/";
    }
    return {
        status,
        username,
    };
}
