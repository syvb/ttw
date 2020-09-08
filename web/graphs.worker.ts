// @ts-ignore
import beebrain from "../road/src/beebrain.js";
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
            console.log("bb",beebrain);
            // @ts-ignore
            self.postMessage({
                type: "graphImg",
                goalId: goal.id,
                graphImg,
            });
        });
    } else {
        console.warn("Ignored message with unknown type", e.data.type);
    }
});
