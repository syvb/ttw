<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    const dateUtils = import("../../date-utils.ts");

    let graphLoadPromise, chart;
    async function genData(pings) {
        const dU = await dateUtils;
        return pings.map(ping => {
            const dateObj = (new Date(ping.time * 1000));
            const dayNum = dU.daysSince1900ish(dateObj);
            const dayMs = dU.msIntoDay(dateObj);
            return {
                x: dayNum,
                y: -dayMs,
            };
        });
    }

    async function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        const dU = await dateUtils;
        chart = new Chart.Chart(defaultCanvas, {
            type: "scatter",
            data: {
                // labels: [],
                datasets: [{
                    label: "Pings per hour",
                    borderColor: (window.__theme === "dark") ? "white" : "black",
                    backgroundColor: `rgba(${(window.__theme === "dark") ? "100%, 100%, 100%" : "0%, 0%, 0%"}, 60%)`,
                    data: [],
                }]
            },
            options: {
                title: {
                    display: true,
                    text: "Daily distribution"
                },
                scales: {
                    y: {
                        ticks: {
                            beginAtZero: true,
                            callback: tick => dU.msToTimeString(-tick),
                        },
                    },
                    x: {
                        ticks: {
                            callback: tick => dU.dayNumToDateString(tick),
                        },
                    },
                },
                tooltips: {
                    callbacks: {
                        label: (tooltipItem, data) => `${dU.dayNumToDateString(parseInt(tooltipItem.label, 10))} ${dU.msToTimeString(-parseInt(tooltipItem.value, 10))}`
                    }
                }
            }
        });
    }

    // onMount(async () => {
    //     await graphLoadPromise;
    // });
    const graphUpdate = async e => {
        const { pings } = e.detail;
        const chartData = await genData(pings);
        console.log("updating graph", pings, chartData);
        chart.data.datasets[0].data = chartData;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">Pings scatter plot</span>
</Graph>
