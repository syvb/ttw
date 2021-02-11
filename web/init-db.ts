const Dexie = require("dexie").default;

const db: any = new Dexie("retag");
db.version(5).stores({
    // non-indexed priperties: type
    goals: "id,name,beemGoal",
})
db.version(4).stores({
    // non-indexed properties: comment
    pings: "time,*tags,category,interval,unsynced",
    keyVal: "key", // remove val store
});
db.version(3).stores({
    // non-indexed properties: comment
    pings: "time,*tags,category,interval,unsynced",
    tags: "tag,count",
    keyVal: "key,val", // added in v2
});
// versons 1, 2 were development versions and were never used in a production enviroment
self.db = db;
