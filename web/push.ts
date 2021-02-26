// @ts-ignore
import urlBase64ToUint8Array from "./urlBase64ToUint8Array.ts";
const config = require("../config.json");

export async function unsub() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration !== undefined) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            console.log("Unsubscribed", subscription.endpoint);
            const unsubPromise = subscription.unsubscribe();
            const fetchPromise = fetch(config["api-server"] + "/internal/push/unregister", {
                method: "POST",
                headers: {
                    "Content-type": "application/json"
                },
                body: JSON.stringify({
                    subscription,
                })
            });
            return Promise.all([unsubPromise, fetchPromise]);
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
    let seed: number, avgInterval: number, alg: number;
    if (self.pintData) {
        seed = self.pintData.seed;
        avgInterval = self.pintData.avg_interval;
        alg = self.pintData.alg;
        // don't wait for DB update to complete
        db.keyVal.bulkPut([
            { key: "seed", value: seed },
            { key: "avgInterval", value: avgInterval },
            { key: "alg", value: alg },
        ]);
    } else {
        const dbData = await db.keyVal.bulkGet([
            "seed", "avgInterval", "alg"
        ]);
        if (dbData[0] === undefined || dbData[1] === undefined || dbData[2] === undefined) {
            console.warn("Failed to sub due to a lack of seed/avgData/alg in db.keyVal");
            return;
        }
        seed = dbData[0].value;
        avgInterval = dbData[1].value;
        alg = dbData[2].value;
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
                alg: alg,
            },
        }),
    });
}

export async function sub() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
        alert("Failed to enable notifications since a ServiceWorker isn't registered. Try closing all tabs from this website, then re-opening them.")
        return;
    }
    await subWithReg(reg);
}

export async function pushLoadCheck() {
    if (!("serviceWorker" in navigator)) return;
    if (localStorage["retag-notifs"] !== "1") return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return; // no sw registered, let's try again next reload?
    const subscription = await reg.pushManager.getSubscription();
    if (subscription === null) {
        await subWithReg(reg);
    }
}
