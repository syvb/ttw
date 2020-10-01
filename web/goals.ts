// @ts-ignore
import pingFilter from "./pingFilter.ts";

// converts a db goal to a beebrain goal
async function brainify(goal: any): Promise<any> {
    const perDay = goal.perInterval; // TODO
    const slug = goal.id;
    const params: any = {
        // see https://doc.beeminder.com/beebrain
        deadline: 0, // Time of deadline given as seconds before or after midnight
        asof: Math.floor(Date.now() / 1000), // Compute everything as of this date w/ future datapoints ghosty
        tini: null, // The coordinates (tini,vini) specify the start of the YBR,
        vini: 0, // typically but not necessarily the same as the initial datapt
        tfin: Math.floor(Date.now() / 1000), // Goal date given as unixtime; end of the Yellow Brick Road
        vfin: null, // The actual value being targeted; any real value
        rfin: perDay, // Final rate (slope) of the YBR before it hits the goal
        runits: "w", // Rate units for road and rfin; one of "y", "m", "w", "d", "h"
        // exprd: false, // Interpret YBR rate as fractional, not absolute, change
        yaw: Math.sign(goal.perInterval), // Which side of the YBR you want to be on, +1 or -1
        dir: Math.sign(goal.perInterval), // Which direction you'll go (usually same as yaw)
        tmin: null, // Earliest date (unixtime) to plot on the x-axis:
        tmax: null, // ((tmin,tmax), (vmin,vmax)) give the plot range, ie, they
        vmin: null, // control zooming/panning; they default to the entire
        vmax: null, // plot -- from tini to past the akrasia horizon
        kyoom: false, // Cumulative; plot values as the sum of all those entered so far
        // prekyoom: 0, // Cumulative total from before the first entered datapoint
        odom: false, // Treat zeros as accidental odometer resets
        abslnw: null, // Override road width algorithm with a fixed absolute lane width
        edgy: false, // DEPRECATED: Put initial point on the road edge
        noisy: false, // Compute road width based on data, not just road rate
        integery: false, // Whether values are necessarily integers (used in limsum) [*]
        monotone: false, // Whether the data is necessarily monotone (used in limsum) [*]
        aggday: "sum", // How to aggregate points on the same day, eg, min/max/mean
        plotall: true, // Plot all the points instead of just the aggregated point
        steppy: false, // Join dots with purple steppy-style line
        rosy: false, // Show the rose-colored dots and connecting line
        movingav: true, // Show moving average line superimposed on the data
        aura: false, // Show blue-green/turquoise aura/swath
        yaxis: "seconds", // Label for the y-axis, eg, "kilograms"
        waterbuf: null, // Watermark on the good side of the YBR; safebuf if null
        waterbux: "", // Watermark on the bad side, ie, the pledge amount
        stathead: true, // Whether to include a label w/ stats at top of graph (DEV ONLY)
        imgsz: 760, // Image size; width (in pixels) of the graph image
        yoog: goal.name, // Username/graphname, eg, "alice/weight"
    };
    const crit = {
        includedTags: goal.includedTags,
        excludedTags: goal.excludedTags,
        includeType: goal.includeType,
        range: goal.range,
    };
    const data = (await window.db.pings
        .orderBy("time")
        .reverse()
        .filter(row => pingFilter(row, crit))
        .toArray())
        .map(({ time, interval, tags, comment }) => [
            time, // date
            interval, // value
            `${tags.join(", ")}${comment ? ` (${comment})` : ""}`, // comment
        ]);
    console.log("data", data);
    params.tini = data[0] ? data[0][0] : Math.floor(Date.now() / 1000);
    params.road = [
        [params.tini, null, perDay],
    ];
    return { slug, params, data, id: goal.id };
}

let graphCache = {};
export function getGraph(goal: any, ele: any, bgraph: any) {
    return new Promise(async (resolve, reject) => {
        if (graphCache[goal.id] !== undefined) resolve(graphCache[goal.id]);
        const brainGoal = await brainify(goal);
        const graph = new bgraph({
            divGraph: ele,
            svgSize: { width: 800, height: 600 },
            focusRect: { x:0, y:0, width:800, height: 453 },
            ctxRect: { x:0, y:453, width:800, height: 100 },
            showContext: true
        });
        graph.loadGoalJSON(brainGoal);
    });
}
