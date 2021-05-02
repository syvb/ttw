<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    const dateUtils = import("../../date-utils.ts");

    let graphLoadPromise, chart;
    async function genData(pings, pings2) {
        const dU = await dateUtils;
        let minDay = Infinity;
        let maxDay = 0;
        const p1 = pings.map(ping => {
            const dateObj = (new Date(ping.time * 1000));
            const dayNum = dU.daysSince1900ish(dateObj);
            if (dayNum > maxDay) maxDay = dayNum;
            if (dayNum < minDay) minDay = dayNum;
            return dayNum;
        });
        const p2 = pings2.map(ping => {
            const dateObj = (new Date(ping.time * 1000));
            const dayNum = dU.daysSince1900ish(dateObj);
            if (dayNum > maxDay) maxDay = dayNum;
            if (dayNum < minDay) minDay = dayNum;
            return dayNum;
        });
        if (minDay === Infinity || maxDay === 0) return [];
        let data = [];
        let maxCount = 1;
        for (let day = minDay; day <= maxDay; day++) {
            const p1Count = p1.filter(num => num === day).length;
            const p2Count = p2.filter(num => num === day).length;
            if (p1Count === 0 || p2Count === 0) continue;
            const matching = data.filter(datum => datum.x === p1Count && datum.y === p2Count);
            if (matching.length === 0) {
                data.push({
                    x: p1Count,
                    y: p2Count,
                    count: 1,
                });
            } else {
                matching[0].count++;
                if (matching[0].count > maxCount) maxCount = matching[0].count;
            }
        }
        return data.map(point => ({
            ...point,
            r: (point.count / maxCount) * 35
        }));
    }

    async function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        const dU = await dateUtils;
        chart = new Chart.Chart(defaultCanvas, {
            type: "bubble",
            data: {
                // labels: [],
                datasets: [{
                    label: "Pings on day",
                    borderColor: (window.__theme === "dark") ? "white" : "black",
                    backgroundColor: `rgba(${(window.__theme === "dark") ? "100%, 100%, 100%" : "0%, 0%, 0%"}, 60%)`,
                    data: [],
                }]
            },
            options: {
                title: {
                    display: true,
                    text: "Correlation"
                },
            }
        });
    }

    // onMount(async () => {
    //     await graphLoadPromise;
    // });
    const graphUpdate = async e => {
        const { pings, pings2 } = e.detail;
        const chartData = await genData(pings, pings2);
        console.log("updating graph", pings, chartData);
        chart.data.datasets[0].data = chartData;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs doubleSelect>
    <span slot="title">Correlation analysis</span>
</Graph>
