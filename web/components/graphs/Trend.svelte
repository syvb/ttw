<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    const dateUtils = import("../../date-utils.ts");

    export let intervalName;
    export let intervalDurationName;
    let graphLoadPromise, chart;

    async function genData(pings) {
        let intervalTotalHours = {};
        let intervalNames = {};
        let stringifyIntervalIdFunc;
        const dU = await dateUtils;
        if (intervalName === "Daily") {
            stringifyIntervalIdFunc = dU.dayNumToDateString;
        } else if (intervalName === "Weekly") {
            stringifyIntervalIdFunc = num => `${Math.floor(num / 53)} week ${(num % 53) + 1}`;
        } else if (intervalName === "Monthly") {
            stringifyIntervalIdFunc = dU.monthNumToString;
        } else {
            throw new Error("invalid intervalId")
        }
        pings.forEach(ping => {
            let intervalId;
            const dateObj = new Date(ping.time * 1000);
            if (intervalName === "Daily") {
                intervalId = dU.daysSince1900ish(dateObj);
            } else if (intervalName === "Weekly") {
                intervalId = dU.weekScore(dateObj);
            } else if (intervalName === "Monthly") {
                intervalId = dU.monthsSince1900(dateObj);
            } else {
                throw new Error("unreachable")
            }
            const intervalInHours = ping.interval / 3600;
            if (intervalTotalHours[intervalId] === undefined) {
                intervalTotalHours[intervalId] = intervalInHours;
                intervalNames[intervalId] = stringifyIntervalIdFunc(intervalId);
            } else {
                // 3600 is 1 hour in seconds
                intervalTotalHours[intervalId] += intervalInHours;
            }
        });
        let data = Object.keys(intervalTotalHours)
            .map(x => ({
                x: parseInt(x, 10),
                y: intervalTotalHours[x],
                name: intervalNames[x],
            }))
            .sort((a, b) => a.x - b.x);
        if (data.length === 0) return { data: [], labels: [] };
        const dataStart = data[0].x;
        const dataEnd = data[data.length - 1].x;
        for (let i = dataStart; i <= dataEnd; i++) {
            if (intervalTotalHours[i] === undefined) {
                data.push({
                    x: i,
                    y: 0,
                    name: stringifyIntervalIdFunc(i),
                });
            }
        }
        data = data.sort((a, b) => a.x - b.x);
        const labels = data.map(datum => datum.name);
        return { data, labels };
    }

    function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        chart = new Chart.Chart(defaultCanvas, {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    label: `Hours per ${intervalDurationName}`,
                    borderColor: (window.__theme === "dark") ? "white" : "black",
                    backgroundColor: `rgba(${(window.__theme === "dark") ? "100%, 100%, 100%" : "0%, 0%, 0%"}, 60%)`,
                    barPercentage: 1,
                    categoryPercentage: 1,
                    data: [],
                }]
            },
            options: {
                title: {
                    display: true,
                    text: `${intervalName} trend`,
                },
                scales: {
                    y: [{
                        ticks: {
                            beginAtZero: true
                        }
                    }]
                }
            }
        });
    }

    const graphUpdate = async e => {
        const { pings } = e.detail;
        const { data: chartData, labels } = await genData(pings);
        console.log("chartData", chartData);
        chart.data.datasets[0].data = chartData;
        chart.data.labels = labels;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">{intervalName} trend</span>
</Graph>
