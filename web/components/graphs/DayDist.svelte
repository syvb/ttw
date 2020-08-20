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
        for (let hour in hourCounts) {
            // data.push({
            //     x: parseInt(hour) + 1,
            //     y: hourCounts[hour],
            // })
            data.push(hourCounts[hour]);
        }
        return data;
    }

    function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        const color = Chart.helpers.color;
        chart = new Chart(defaultCanvas, {
            type: "bar",
            data: {
                labels: (new Array(24)).fill().map((_ele, i) => (i).toString() + ":00"),
                datasets: [{
                    label: "Pings per hour",
                    borderColor: "black",
                    backgroundColor: color("black").alpha(0.6).rgbString(),
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
                    yAxes: [{
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
        console.log("updating graph", pings, chartData);
        chart.data.datasets[0].data = chartData;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">Daily distribution</span>
</Graph>
