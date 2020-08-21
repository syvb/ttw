<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    import { dayNumToDateString, getDOY, msToTimeString, daysSince1900ish, msIntoDay } from "../../date-utils.ts";
    let graphLoadPromise, chart;

    function genData(pings) {
        return pings.map(ping => {
            const dateObj = (new Date(ping.time * 1000));
            const dayNum = daysSince1900ish(dateObj);
            const dayMs = msIntoDay(dateObj);
            return {
                x: dayNum,
                y: -dayMs,
            };
        });
    }

    function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        const color = Chart.helpers.color;
        chart = new Chart(defaultCanvas, {
            type: "scatter",
            data: {
                // labels: [],
                datasets: [{
                    label: "Pings per hour",
                    borderColor: (window.__theme === "dark") ? "white" : "black",
                    backgroundColor: color((window.__theme === "dark") ? "white" : "black").alpha(0.6).rgbString(),
                    data: [],
                }]
            },
            options: {
                title: {
                    display: true,
                    text: "Daily distribution"
                },
                scales: {
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                            userCallback: tick => msToTimeString(-tick),
                        },
                    }],
                    xAxes: [{
                        ticks: {
                            userCallback: tick => dayNumToDateString(tick),
                        },
                    }],
                },
                tooltips: {
                    callbacks: {
                        label: (tooltipItem, data) => `${dayNumToDateString(parseInt(tooltipItem.label, 10))} ${msToTimeString(-parseInt(tooltipItem.value, 10))}`
                    }
                }
            }
        });
    }

    // onMount(async () => {
    //     await graphLoadPromise;
    // });
    const graphUpdate = e => {
        const { pings } = e.detail;
        const chartData = genData(pings);
        console.log("updating graph", pings, chartData);
        chart.data.datasets[0].data = chartData;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">Pings scatter chart</span>
</Graph>
