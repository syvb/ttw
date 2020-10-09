// Utilities for working with Beeminder.
const config = require("../config.json");
const BEEM_URI = config.overrideBeem ?? "https://www.beeminder.com";

export function authUrl() {
    const redirUri = `${config["root-domain"]}/`;
    return `${BEEM_URI}/apps/authorize?client_id=${config["beem-client"]}&redirect_uri=${redirUri}&response_type=token`;
}

export async function beemLoadCheck() {
    const params = new URLSearchParams(location.search);
    const token = params.get("access_token");
    const username = params.get("username");
    if (!token || !username) return;
    // ...?
    const beeInfo = await (await fetch(`${BEEM_URI}/api/v1/users/me.json?auth_token=${token}`)).json();
    if (beeInfo.errors) {
        alert(`There was an error logging in with Beeminder: ${beeInfo.errors.message}`)
        return;
    }
    if (beeInfo.username !== username) {
        alert(`BTW, Beeminder thinks your username is "${beeInfo.username}", but the URL params say it's "${username}". Weird.`);
    }
    alert(`Sucessfully authenticated with Beeminder as ${username}.`)
}
