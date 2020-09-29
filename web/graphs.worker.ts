import * as beebrain from "../road/src/beebrain.js";
import * as bgraph from "../road/src/bgraph.js";
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
            const brain = new beebrain(goal);
            let pmData: any = {
                type: "graphImg",
                goalId: goal.id,
            };
            const stats = brain.getStats();
            console.log("brain", brain, stats);
            if (stats.error) {
                pmData.error = stats.error;
            } else {
                pmData.graphImg = graphImg;
            }
            // @ts-ignore
            self.postMessage(pmData);
        });
    } else {
        console.warn("Ignored message with unknown type", e.data.type);
    }
});
