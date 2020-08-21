<script>
    import PingSelector from "../PingSelector.svelte";
    import Loading from "../Loading.svelte";
    import { Link } from "svelte-routing";
    import { onMount, createEventDispatcher } from "svelte";
    import { allPings } from "../../pings.ts";

    const dispatch = createEventDispatcher();

    export let loadChartjs = false;
    let graphLoadPromiseResolve;
    export const graphLoadPromise = new Promise((resolve, _reject) => graphLoadPromiseResolve = resolve);

    let graphSlot, defaultCanvas, showMorePings, loading, forcedLocal, curPaginating, pings;
    let chartjsPromise;
    let loaded = false;
    let dispatchGraphUpdateOnLoad = false;

    onMount(async () => {
        if (loadChartjs && !window.Chart) {
            window.Chart = (await import("chart.js")).default;
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
                pings,
                graphEle: graphSlot,
                defaultCanvas,
            });
        }
    });

    function pingsChanged() {
        if (loading) return;
        if (!loaded) {
            dispatchGraphUpdateOnLoad = true;
            return;
        }
        dispatch("graphUpdate", {
            pings,
            graphEle: graphSlot,
            defaultCanvas,
        });
    }


    let showMoreDisabled = false;
    async function showMore() {
        showMoreDisabled = true;
        await showMorePings();
        showMoreDisabled = false;
    }
</script>

<!-- Generic graph component -->
<h1><slot name="title"></slot></h1>
<div>
    Back to <Link to="/graphs">all graphs</Link>
</div>

<PingSelector bind:showMorePings bind:loading bind:pings bind:forcedLocal bind:curPaginating pingsChanged={pingsChanged} open />
{#if curPaginating && !forcedLocal}
    <button class="show-more" disabled={showMoreDisabled} on:click={showMore}>Load older pings</button>
{/if}

<div>
    <slot name="graph">
        <canvas width="500" height="200" bind:this={defaultCanvas}>
            Sorry, your browser is old and doesn't support canvas.
        </canvas>
    </slot>
</div>
