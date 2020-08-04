// @ts-ignore
import urlBase64ToUint8Array from "./urlBase64ToUint8Array.ts";
const config = require("../config.json");

export async function unsub() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration !== undefined) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            console.log("Unsubscribed", subscription.endpoint);
            return fetch(config["api-server"] + "/internal/push/unregister", {
                method: "POST",
                headers: {
                    "Content-type": "application/json"
                },
                body: JSON.stringify({
                    subscription,
                })
            });
        }
    }
    console.log("Ignoring unsub request since no sub found");
}

export async function subWithReg(reg: ServiceWorkerRegistration) {
    const options = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config["vapid-public"])
    };
    const subscription = await reg.pushManager.subscribe(options);
    console.log("got push sub", subscription.toJSON());
    let seed: number, avgInterval: number;
    if (self.pintData) {
        seed = self.pintData.seed;
        avgInterval = self.pintData.avg_interval;
        // don't wait for DB update to complete
        db.keyVal.bulkPut([
            { key: "seed", value: seed },
            { key: "avgInterval", value: avgInterval },
        ]);
    } else {
        const dbData = await db.keyVal.bulkGet([
            "seed", "avgInterval",
        ]);
        if (dbData[0] === undefined || dbData[1] === undefined) {
            console.warn("Failed to sub due to a lack of seed/avgData in db.keyVal");
            return;
        }
        seed = dbData[0].value;
        avgInterval = dbData[1].value;
    }
    return fetch(config["api-server"] + "/internal/push/register", {
        method: "POST",
        headers: {
            "Content-type": "application/json"
        },
        body: JSON.stringify({
            subscription,
            pintData: {
                seed,
                avg_interval: avgInterval,
            },
        }),
    });
}

export async function sub() {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
        alert("Failed to enable notifications since a ServiceWorker isn't registered. Try closing all tabs from this website, then re-opening them.")
        return;
    }
    await subWithReg(reg);
}

export async function pushLoadCheck() {
    if (localStorage["retag-notifs"] !== "1") return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return; // no sw registered, let's try again next reload?
    const subscription = await reg.pushManager.getSubscription();
    if (subscription === null) {
        await subWithReg(reg);
    }
}
