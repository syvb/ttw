// @ts-ignore
import { syncConfig } from "./sync.ts";
// @ts-ignore
import { unsub } from "./push.ts";

export function toDurString(n: number) {
    const seconds = n % 60;
    const minutes = (n - seconds) / 60;
    return `${minutes.toFixed(0).padStart(2, "0")}:${seconds.toFixed(0).padStart(2, "0")}`;
}

export function fromDurString(str: string) {
    const parts = str.split(":");
    if (parts.length !== 2) return false;
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    const val = (minutes * 60) + seconds;
    if (Number.isNaN(val)) return false;
    return val;
}

export async function updatePint(pintAvgInterval: string, pintSeed: string, tagtimeAlg: boolean) {
    const interval = fromDurString(pintAvgInterval);
    if (interval === false) {
        return alert("Invalid average interval duration.");
    }
    const seed = parseInt(pintSeed, 10);
    if (Number.isNaN(seed)) {
        return alert("Invalid seed.");
    }
    localStorage["retag-pint-interval"] = interval.toString();
    localStorage["retag-pint-seed"] = seed.toString();
    localStorage["retag-pint-alg"] = tagtimeAlg ? "tagtime" : "fnv";
    localStorage["retag-notifs"] = "";
    // try to sync up before reloading
    await Promise.all([
        syncConfig([
            "retag-pint-interval",
            "retag-pint-seed",
            "retag-pint-alg",
        ]),
        unsub(),
        window.db.keyVal.delete("notifs"), // does nothing if key already exists
    ]);
    // reload to allow the new values to take effect
    location.reload();
}
