const Dexie = require("dexie").default;

if (!self.indexedDB) {
    // alert won't work in Worker but we shouldn't get here in a worker as the SW is only loaded
    // after the DB is setup
    alert("Your browser is outdated and doesn't support indexedDB. Please update your browser.");
}

const db: any = new Dexie("retag");
db.version(5).stores({
    // non-indexed properties: type
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

self.addEventListener("unhandledrejection", e => {
    console.log("unhandled promise rejection!", e);
    if ((typeof e === "object") &&
        (typeof e.reason === "object") &&
        (typeof e.reason.name === "string") &&
        (e.reason.name === "OpenFailedError")) {
        alert("There was an error setting up the database, probably because your browser is in private browsing mode. Make sure you aren't in private browsing mode.");
    }
});

self.db = db;
