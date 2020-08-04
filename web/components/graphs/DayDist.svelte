<script>
    import Graph from "./Graph.svelte";
    let pings;
</script>

<Graph bind:pings>
    <span slot="title">Daily distribution</span>
    <span slot="graph">
        TODO: graph
    </span>
</Graph>
