<script>
    import Graph from "./Graph.svelte";
    let pings;
    const graphLoad = () => {

    };
</script>

<Graph bind:pings graphLoad={graphLoad} loadChartjs>
    <span slot="title">Daily distribution</span>
    <span slot="graph">
        TODO: graph
    </span>
</Graph>
