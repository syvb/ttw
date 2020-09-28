// @ts-ignore
import GraphsWorker from "./graphs.worker.ts";

let cachedGraphsWorker = null;
function getWorker() {
    if (cachedGraphsWorker === null) {
        cachedGraphsWorker = new GraphsWorker();
    }
    return cachedGraphsWorker;
}

let graphCache = {};
export function getGraph(goal: any) {
    return new Promise(async (resolve, reject) => {
        if (graphCache[goal.id] !== undefined) resolve(graphCache[goal.id]);
        let graphsWorker = getWorker();
        graphsWorker.postMessage({
            type: "genGraphs",
            goals: [goal]
        });
        let listener = e => {
            if (e.data.goalId === goal.id) {
                graphsWorker.removeEventListener("message", listener);
                resolve(e.data.graphImg);
            }
        };
        graphsWorker.addEventListener("message", listener);
    });
}
