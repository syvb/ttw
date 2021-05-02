<script>
    import PingSelector from "../PingSelector.svelte";
    import Loading from "../Loading.svelte";
    import { Link } from "svelte-routing";
    import { onMount, createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    export let loadChartjs = false;
    export let doubleSelect = false;
    let graphLoadPromiseResolve;
    export const graphLoadPromise = new Promise((resolve, _reject) => graphLoadPromiseResolve = resolve);

    let graphSlot, defaultCanvas, showMorePings, showMorePings2, loading, loading2, forcedLocal, curPaginating, pings, pings2;
    let chartjsPromise;
    let loaded = false;
    let dispatchGraphUpdateOnLoad = false;

    onMount(async () => {
        if (loadChartjs && !window.Chart) {
            window.Chart = (await import("chart.js"));
            window.Chart.registry.add(...window.Chart.registerables);
        }
        loaded = true;
        graphLoadPromiseResolve({
            graphEle: graphSlot,
            defaultCanvas,
        });
        dispatch("graphLoad", {
            defaultCanvas,
            graphEle: graphSlot,
        });
        if (dispatchGraphUpdateOnLoad) {
            dispatch("graphUpdate", {
                pings, pings2,
                graphEle: graphSlot,
                defaultCanvas,
            });
        }
    });

    function pingsChanged() {
        if (loading || loading2) return;
        if (!loaded) {
            dispatchGraphUpdateOnLoad = true;
            return;
        }
        dispatch("graphUpdate", {
            pings, pings2,
            graphEle: graphSlot,
            defaultCanvas,
        });
    }

    let showMoreDisabled = false;
    async function showMore() {
        showMoreDisabled = true;
        await showMorePings();
        if (showMorePings2) await showMorePings2();
        showMoreDisabled = false;
    }
</script>

<style>
    #maincontent {
        margin: 8px;
    }
</style>

<!-- Generic graph component -->
<main id="maincontent">
    <h1><slot name="title"></slot></h1>
    <div>
        Back to <Link to="/graphs">all graphs</Link>
    </div>

    <PingSelector pageReqSize={250} bind:showMorePings bind:loading bind:pings bind:forcedLocal bind:curPaginating pingsChanged={pingsChanged} open />
    {#if doubleSelect}
        <PingSelector pageReqSize={250} bind:showMorePings={showMorePings2} bind:loading={loading2} bind:pings={pings2} {curPaginating} pingsChanged={pingsChanged} open />
    {/if}
    {#if curPaginating && !forcedLocal}
        <button class="show-more" disabled={showMoreDisabled} on:click={showMore}>Load older pings</button>
    {/if}

    <div>
        <slot name="graph">
            <canvas width="500" height="200" bind:this={defaultCanvas}>
                Sorry, your browser is old and doesn&rsquo;t support canvas.
            </canvas>
        </slot>
    </div>
</main>
