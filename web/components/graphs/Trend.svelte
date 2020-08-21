<script>
    import Graph from "./Graph.svelte";
    import {
        getDOY,
        dayNumToDateString,
        daysSince1900ish,
        weeksSince1900ish,
        monthsSince1900,
        monthNumToString,
    } from "../../date-utils.ts";
    import { onMount } from "svelte";

    export let intervalName;
    export let intervalDurationName;
    let graphLoadPromise, chart;

    function genData(pings) {
        let intervalTotalHours = {};
        let intervalNames = {};
        let stringifyIntervalIdFunc;
        if (intervalName === "Daily") {
            stringifyIntervalIdFunc = dayNumToDateString;
        } else if (intervalName === "Weekly") {
            stringifyIntervalIdFunc = num => `week ${num}`;
        } else if (intervalName === "Monthly") {
            stringifyIntervalIdFunc = monthNumToString;
        } else {
            throw new Error("invalid intervalId")
        }
        pings.forEach(ping => {
            let intervalId;
            const dateObj = new Date(ping.time * 1000);
            if (intervalName === "Daily") {
                intervalId = daysSince1900ish(dateObj);
            } else if (intervalName === "Weekly") {
                intervalId = weeksSince1900ish(dateObj);
            } else if (intervalName === "Monthly") {
                intervalId = monthsSince1900(dateObj);
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
        const color = Chart.helpers.color;
        chart = new Chart(defaultCanvas, {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    label: `Hours per ${intervalDurationName}`,
                    borderColor: (window.__theme === "dark") ? "white" : "black",
                    backgroundColor: color((window.__theme === "dark") ? "white" : "black").alpha(0.6).rgbString(),
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
                    yAxes: [{
                        ticks: {
                            beginAtZero: true
                        }
                    }]
                }
            }
        });
    }

    const graphUpdate = e => {
        const { pings } = e.detail;
        const { data: chartData, labels } = genData(pings);
        console.log("chartData", chartData);
        chart.data.datasets[0].data = chartData;
        chart.data.labels = labels;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">{intervalName} trend</span>
</Graph>
