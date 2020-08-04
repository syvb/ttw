// graphgen is a script that generates SVG graphs for Retag.
// It can be run in multiple contexts:
// - From the command line
// - From front-end code running in the browser as a CommonJS module
// - From Node.js as a CommonJS module (used in the backend)

const graphs = {

};

// A graph is generated based on three things:
// - the type of graph
// - the pings to plot
// - the graph config (optional)
function genGraph(type, pings, config) {

}
module.exports = genGraph;

const globalObj = (typeof window === "undefined") ? global : window;
const args = globalObj.process ? (globalObj.process.argv.slice(2)) : [];
if (args.length > 0) {
    const firstArg = args[0].trim();
    if (firstArg !== "") {
        const fs = require("fs");
        const secondArg = args[1].trim();
        const thirdArg = args[2].trim();
        console.log(genGraph(
            firstArg,
            fs.readFileSync(secondArg, "utf-8")
                .split("\n")
                .filter(line => line.length > 0)
                .map(line => line.split(" "))
                .map(parts => ({
                    time: parseInt(parts[0], 10),
                    tags: parts.slice(1),
                })),
            JSON.parse(fs.readFileSync(thirdArg)),
        ));
    }
}
