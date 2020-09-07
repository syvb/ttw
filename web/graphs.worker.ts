const config = require("../config.json");

// we don't bother with checking the target origin, since we don't use any
// persistent data
self.addEventListener("message", e => {
    if (!e.data || !e.data.type) {
        console.warn("Ignored message without type property.");
        return;
    }
    if (e.data.type === "genGraphs") {
        // start generating graphs
        e.data.goals.forEach(goal => {
            // TODO: generate
            let graphImg = "...";
            self.postMessage({
                type: "graphImg",
                goalId: goal.id,
            }, "*");
        });
    } else {
        console.warn("Ignored message with unknown type", e.data.type);
    }
});
