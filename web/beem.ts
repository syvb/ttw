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
async function prepGoal(name: string) {
    if (!localStorage["retag-beem-token"]) throw new Error("no beem token");
    // datasource -> integration name
    await fetch(`${BEEM_URI}/api/v1/users/me/goals/${name}.json`, {
        method: "PUT",
        body: JSON.stringify({
            datasource: config["beem-name"],
        })
    })
    // set goal hhmmformat -> true, gunits -> "seconds" ...somehow?
    // force an autodata refetch (roundabout way to force Beeminder to talk to our server)
    // must be done *after* goal is updated
    // TODO
}
