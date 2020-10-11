// @ts-ignore
import { syncConfig } from "./sync.ts";

export async function goalsChanged() {
    const goalData = JSON.stringify(await window.db.goals.toArray());
    localStorage["retag-goals"] = goalData;
    await syncConfig([ "retag-goals" ]);
}
