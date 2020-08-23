const Dexie = require("dexie").default;

const db: any = new Dexie("retag");
db.version(5).stores({
    // new table
    // non-indexed properties: 
    todos: "id,name,*children,done"
})
db.version(4).stores({
    // non-indexed properties: comment
    pings: "time,*tags,category,interval,unsynced",
    // non-indexed properties: val
    keyVal: "key", // remove val store
});
db.version(3).stores({
    // non-indexed properties: comment
    pings: "time,*tags,category,interval,unsynced",
    tags: "tag,count",
    keyVal: "key,val", // added in v2
});
// Note: versions 1-2 predate the
self.db = db;
