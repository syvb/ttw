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

    // onMount(async () => {
    //     await graphLoadPromise;
    // });
    const graphUpdate = e => {
        const { defaultCanvas, pings } = e.detail;
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
                    data: genData(pings),
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
        })
    };
</script>

<Graph on:graphUpdate={graphUpdate} bind:graphLoadPromise loadChartjs>
    <span slot="title">Daily distribution</span>
</Graph>
