// Utilities for working with Beeminder.
// @ts-ignore
import { syncConfig } from "./sync.ts";

const config = require("../config.json");
const BEEM_URI = config.overrideBeem ?? "https://www.beeminder.com";

export function authUri() {
    const redirUri = `${config["root-domain"]}/goals`;
    return `${BEEM_URI}/apps/authorize?client_id=${config["beem-client"]}&redirect_uri=${redirUri}&response_type=token`;
}

export function beeRedir() {
    const uri = authUri();
    location.href = uri;
}

export async function beemLoadCheck() {
    const params = new URLSearchParams(location.search);
    const token = params.get("access_token");
    const username = params.get("username");
    if (!token || !username) return;
    // ...?
    const beeInfo = await (await fetch(`${BEEM_URI}/api/v1/users/me.json?access_token=${token}`)).json();
    if (beeInfo.errors) {
        alert(`There was an error logging in with Beeminder: ${beeInfo.errors.message}`);
        return;
    }
    if (beeInfo.username !== username) {
        alert(`BTW, Beeminder thinks your username is "${beeInfo.username}", but the URL params say it's "${username}". Weird.`);
    }
    let syncPromise = Promise.resolve();
    if (localStorage["retag-beem-token"] !== token) {
        localStorage["retag-beem-token"] = token;
        syncPromise = syncConfig([ "retag-beem-token" ]);
    }
    alert(`Sucessfully authenticated with Beeminder as ${username}.`);
    await syncPromise;
    history.pushState(null, "Goals", location.pathname); // remove query params for reload
}

// prepares a goal for usage with TTW
export async function prepGoal(name: string) {
    const token = localStorage["retag-beem-token"];
    if (!token) throw new Error("no beem token");
    // datasource -> integration name
    name = name.toLowerCase().trim();
    const updateUri = `${BEEM_URI}/api/v1/users/me/goals/${name}.json?access_token=${token}&datasource=${encodeURIComponent(config["beem-name"])}&hhmmformat=1&gunits=seconds`;
    const updateRes = await fetch(updateUri, {
        method: "PUT",
    });
    switch (updateRes.status) {
        case 404:
            alert("Beeminder goal doesn't exist.");
            break;
        case 200: case 204:
            break;
        default:
            alert("Failed to update Beeminder goal.");
    }
    // setting goal hhmmformat -> true, gunits -> "seconds" seems impossible with the API
}

export async function beemResync() {
    const token = localStorage["retag-beem-token"];
    if (!token) return "Not logged in with Beeminder";
    const url = `${config["api-server"]}/internal/beem/resync`;
    const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
    });
    if (res.status === 204 || res.status === 200) return;
    return await res.text();
}
