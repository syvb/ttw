<script>
    import Loading from "./Loading.svelte";
    import TagEntry from "./TagEntry.svelte";
    import PingSelector from "./PingSelector.svelte";
    import tagColor from "../tagColor.ts";
    import { putPings } from "../pings.ts";
    import debounce from "../debounce.ts";
    import { onMount, afterUpdate } from "svelte";
    import { backend, MINI_BACKEND, FULL_BACKEND } from "../backend.ts";

    function rowInputComplete(e) {
        this.blur();
    }

    let tbodyEle, tableEle, showMorePings, loading, pings, forcedLocal, curPaginating, setRowsWithoutUpdate;
    let updatingTableSize = false;
    let smaller = false;
    function checkTableSize() {
        updatingTableSize = true;
        if (!tableEle || !tbodyEle || tbodyEle.children.length === 0) {
            smaller = false;
            updatingTableSize = false;
            return;
        }
        smaller = false;
        const biggestTagInputWidth = Math.max.apply(null, [...tbodyEle.children].map(tr => tr.children[1].clientWidth));
        const width = biggestTagInputWidth + (16 * 12) + 16;
        if (window.innerWidth < width) {
            smaller = true;
        } else {
            smaller = false;
        }
        updatingTableSize = false;
    }
    afterUpdate(() => {
        if (!updatingTableSize) checkTableSize()
    });

    let showMoreDisabled = false;
    async function showMore() {
        showMoreDisabled = true;
        await showMorePings();
        showMoreDisabled = false;
    }

    let lastDbUpdate = Promise.resolve();
    const updateRow = i => debounce(async e => {
        console.assert(!loading);
        await lastDbUpdate;
        const newPing = {
            ...pings[i],
            tags: e.detail,
        };
        lastDbUpdate = putPings([newPing]);
        // pings[i].tags = e.detail;
        // pings[i].modified = true;
    }, 1800);

    function pingsChanged() {
        checkTableSize();
    }
</script>

<style>
    table {
        border-spacing: 0;
    }

    td {
        padding-top: 0.5rem;
        padding-bottom: 0.65rem;
    }

    tr:nth-child(2n) {
        background: rgb(227, 227, 233);
    }

    :global(.dark) tr:nth-child(2n) {
        background: rgb(95, 95, 95);
    }

    td:nth-child(2) {
        width: fit-content;
        width: max-content;
        min-width: 14rem;
    }

    .smaller td {
        padding-top: 0.5rem;
        display: block;
        margin: 0;
        padding: 0;
        padding-bottom: 0.65rem;
    }

    .smaller thead {
        display: none;
    }

    td.time-cell {
        margin: 0;
        padding: 0;
        padding-right: 0.5rem;
        padding-left: 0.5rem;
    }

    .show-more {
        font-size: 1.1em;
        margin: 0.5rem;
    }
</style>

<svelte:window on:resize={checkTableSize} />

<div>
    <h1>Pings</h1>
    <div>
        Click on a row to edit it. {smaller}
    </div>
    <PingSelector bind:showMorePings bind:loading bind:pings bind:forcedLocal bind:curPaginating pingsChanged={pingsChanged} />
    {#if loading !== false}
        <Loading />
    {:else}
        <table class:smaller bind:this={tableEle}>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Pings</th>
                </tr>
            </thead>
            <tbody bind:this={tbodyEle}>
                {#each pings as row, i}
                    <tr>
                        <td class="time-cell">{new Date(row.time * 1000).toLocaleString()}</td>
                        <td>
                            <TagEntry on:input={updateRow(i)} on:inputComplete={rowInputComplete} tags={row.tags} forceMobile={smaller} />
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
        {#if curPaginating && !forcedLocal}
            <button class="show-more" disabled={showMoreDisabled} on:click={showMore}>Show more...</button>
        {/if}
    {/if}
</div>
