<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    let pings, graphLoadPromise, chart;


    function generateData() {
        var data = [];
        for (var i = 0; i < 7; i++) {
            data.push({
                x: Math.random() * 100,
                y: Math.random() * 100,
            });
        }
        return data;
    }

    onMount(async () => {
        const { graphEle, defaultCanvas } = await graphLoadPromise;
        var color = Chart.helpers.color;

        chart = new Chart.Scatter(defaultCanvas, {
            data: {
                datasets: [{
                    label: "My First dataset",
                    borderColor: "red",
                    backgroundColor: color("red").alpha(0.2).rgbString(),
                    data: generateData()
                }, {
                    label: "My Second dataset",
                    borderColor: "blue",
                    backgroundColor: color("blue").alpha(0.2).rgbString(),
                    data: generateData()
                }]
            },
            options: {
                title: {
                    display: true,
                    text: "Daily distribution"
                },
            }
        })
    });
    const graphUpdate = e => {
        console.log("updating graph", e);
    };
</script>

<Graph bind:pings on:graphUpdate={graphUpdate} bind:graphLoadPromise loadChartjs>
    <span slot="title">Daily distribution</span>
</Graph>
