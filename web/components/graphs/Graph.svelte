<script>
    import { Link } from "svelte-routing";
    import { onMount, createEventDispatcher } from "svelte";
    import { allPings } from "../../pings.ts";
    const dispatch = createEventDispatcher();

    export let loadChartjs = false;
    let graphLoadPromiseResolve;
    export const graphLoadPromise = new Promise((resolve, _reject) => graphLoadPromiseResolve = resolve);

    let graphSlot, defaultCanvas;
    let chartjsPromise;

    onMount(async () => {
        if (loadChartjs && !window.Chart) {
            window.Chart = (await import("chart.js")).default;
        }
        graphLoadPromiseResolve({
            graphEle: graphSlot,
            defaultCanvas,
        });
        dispatch("graphLoad");
        const matchingPings = await allPings(); // TODO: ping filtering
        dispatch("graphUpdate", {
            pings: matchingPings,
            graphEle: graphSlot,
            defaultCanvas,
        });
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
    <slot name="graph">
        <canvas width="500" height="200" bind:this={defaultCanvas}>
            Sorry, your browser is old and doesn't support canvas.
        </canvas>
    </slot>
</div>
