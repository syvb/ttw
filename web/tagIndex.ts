// @ts-ignore
import { eachLocalPing } from "./pings.ts";

export async function rebuildTagIndex() {
    const clearPromise = window.db.tags.clear();
    const now = Date.now() / 1000;
    let tagData = {};
    await eachLocalPing((row: { tags: string[]; time: number; }) => {
        row.tags.forEach((tag: string) => {
            // weight by time away tag was, will be negative
            const weight = row.time - now;
            if (tagData[tag] === undefined) {
                tagData[tag] = weight;
            } else {
                tagData[tag] += weight;
            }
        });
    });
    let bulkInsertData = [];
    for (const tag in tagData) {
        bulkInsertData.push({
            tag,
            count: tagData[tag],
        });
    }
    await clearPromise;
    await window.db.tags.bulkPut(bulkInsertData);
}

export async function updateTagIndexWithPings(pings: any[]) {
    const tags = Array.prototype.concat.apply([], pings.map((ping: { tags: string[]; }) => ping.tags));
    const ops = tags.map(async (tag: string) => {
        // probably not the most effecient but it works
        await window.db.tags.add({
            tag,
            count: 1,
        }).catch(async err => {
            const curData = await window.db.tags.get(tag);
            await window.db.tags.put({
                tag,
                count: curData.count + 1,
            });
        });
    });
    await Promise.all(ops);
}

function scoreMatch(search: string, match: { count: number; tag: string; }): number {
    let score = match.count;
    if (match.tag.startsWith(search)) score += 1000000;
    return score;
}

export async function searchTagIndex(search: string, num: number): Promise<string[]> {
    search = search.toLowerCase();
    let matching = await db.tags
        .limit(100)
        .filter(tag => tag.tag.includes(search))
        .toArray();
    matching = matching.map(match => ({
        score: scoreMatch(search, match),
        ...match
    }));
    return matching
        .sort((a, b) => a.score - b.score)
        .reverse()
        .slice(0, 3)
        .map(match => match.tag);
}
