<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    let graphLoadPromise, chart;

    function genData(pings) {
        let hourCounts = {}; // 0-23
        for (let i = 0; i < 24; i++) hourCounts[i] = 0;
        pings.forEach(ping => {
            let hour = (new Date(ping.time * 1000)).getHours();
            hourCounts[hour]++;
        });
        let data = [];
        for (let i = 0; i < 24; i++) {
            data.push(hourCounts[i]);
        }
        return data;
    }

    function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        chart = new Chart.Chart(defaultCanvas, {
            type: "bar",
            data: {
                labels: (new Array(24)).fill().map((_ele, i) => (i).toString() + ":00"),
                datasets: [{
                    label: "Pings per hour",
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
                    text: "Daily distribution"
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

    // onMount(async () => {
    //     await graphLoadPromise;
    // });
    const graphUpdate = e => {
        const { pings } = e.detail;
        const chartData = genData(pings);
        chart.data.datasets[0].data = chartData;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">Daily distribution</span>
</Graph>
