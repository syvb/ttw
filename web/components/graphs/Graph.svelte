<script>
    import { Link } from "svelte-routing";
    import { onMount } from "svelte";
    export let pings = {};
    export let loadChartjs = false;
    export let graphLoad = () => {};
    let chartjsPromise;
    if (loadChartjs) chartjsPromise = import("chart.js");
    onMount(async () => {
        if (loadChartjs && !window.Chart) {
            window.Chart = (await chartjsPromise).default;
        }
        graphLoad();
    });
</script>

<!-- Generic graph component -->
<h1><slot name="title"></slot></h1>
<div>
    Back to <Link to="/graphs">all graphs</Link>
</div>

<div>
    Select pings: TODO
</div>

<div>
    <slot name="graph"></slot>
</div>
