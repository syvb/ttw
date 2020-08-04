// @ts-ignore
import { syncPings } from "./sync.ts";
//@ts-ignore
import { backend, FULL_BACKEND, MINI_BACKEND } from "./backend.ts";
const config = require("../config.json");

interface OverallStats {
    total: number,
    totalTime: number | null,
}

export interface Ping {
    time: number,
    tags: string[],
    category: string | null,
    interval: number,
    synced?: boolean,
    comment: string | null,
}

async function retallyPings() {
    console.log("Retallying");
    let pings = await window.db.pings.count();
    if (backend() === MINI_BACKEND) pings += window.miniData.missing;
    window.miniData.total = pings;
}

async function putPingsInternal(pings: Ping[]) {
    await window.db.pings.bulkPut(pings.map(ping => ({
        ...ping,
        unsynced: "",
    })));
    const pendingPromises = [syncPings()];
    if (backend() === MINI_BACKEND) {
        pendingPromises.push(retallyPings());
    }
    await Promise.all(pendingPromises);
}

let putPingsChain = Promise.resolve();
export function putPings(pings: Ping[]): Promise<void> {
    return putPingsChain.then(() => putPingsInternal(pings));
}

export async function overallPingStats(): Promise<OverallStats> {
    if (backend() === MINI_BACKEND) {
        return window.miniData;
    } else if (backend() === FULL_BACKEND) {
        const total = await window.db.pings.count();
        return {
            total,
            totalTime: null,
        };
    }
}

export async function allPings(): Promise<Ping[] | null> {
    if (backend() === MINI_BACKEND) {
        let res: Response;
        try {
            res = await fetch(`${config["api-server"]}/pings`, {
                mode: "cors",
                credentials: "include",
            });
        } catch (e) {
            return null;
        }
        if (res.status === 200) {
            const data = await res.json();
            return data.pings;
        } else {
            return null;
        }
    } else if (backend() === FULL_BACKEND) {
        return window.db.pings.toArray();
    }
}

export function eachLocalPing(cb: (ping: Ping) => void): Promise<void> {
    return window.db.pings.each(cb);
}

export function latestPing(): Promise<Ping> {
    // always same regardless of backend
    return window.db.pings.orderBy("time").last();
}

export function unsyncedPings(): Promise<Ping[]> {
    // always same regardless of backend
    return window.db.pings
        .where("unsynced")
        .equals("")
        .toArray();
}

// TODO: trigger event on window when DB changes
