<script>
    import { createEventDispatcher } from "svelte";
    import DateRangePicker from "./DateRangePicker.svelte";
    import TagEntry from "./TagEntry.svelte";
    import { backend, MINI_BACKEND, FULL_BACKEND } from "../backend.ts";
    import humanizeDuration from "humanize-duration";
    import { overallPingStats } from "../pings.ts";
    import pingFilter from "../pingFilter.ts";
    const config = require("../../config.json");

    // dispatched change event whenever anything changes, except range (not yet supported)

    export let pings = [];
    export let loading = true;
    export const showMorePings = function () {
        const promise = fetchDbData(true);
        promise.then(pingsChanged);
        return promise;
    }
    export let pingsChanged = () => {};
    export let open = false;

    export let includedTags = [];
    export let excludedTags = [];
    export let includeType = "some";
    export let norange = false;
    export let justcrit = false;

    export let pageReqSize = 100;

    export let range = [];
    let paginate = backend() === MINI_BACKEND;
    export let curPaginating = paginate;
    let paginateStart = null;
    export let forcedLocal = false;

    function getCrit() {
        return { includedTags, excludedTags, includeType, range };
    }

    let totalUnfiltered = null;
    async function fetchFromLocal() {
        const crit = getCrit();
        const allRows = await window.db.pings
            .orderBy("time")
            .reverse()
            .toArray();
        const filteredRows = allRows.filter(row => pingFilter(row, crit));
        return {
            rows: filteredRows,
            totalUnfiltered: allRows.length,
        }
    }

    let overallStats = { total: 0, totalTime: 0 };

    // when append = true be very careful to avoid deadlock or infinite recursion
    async function fetchDbData(append) {
        let pingsFetchPromise;
        if ((backend() === FULL_BACKEND) || justcrit) {
            forcedLocal = false;
            pingsFetchPromise = fetchFromLocal();
        } else if (backend() === MINI_BACKEND) {
            const queryStringParams = new URLSearchParams();
            queryStringParams.set("no204", "1");
            if (curPaginating) queryStringParams.set("limit", pageReqSize);
            if (range.length === 2) queryStringParams.set("startTime", (Number(range[0]) / 1000).toFixed(0));
            if (curPaginating && (paginateStart !== null)) {
                queryStringParams.set("endTime", paginateStart);
            } else if (range.length === 2) {
                queryStringParams.set("endTime", (Number(range[1]) / 1000).toFixed(0));
            }
            const url = `${config["api-server"]}/pings?${queryStringParams.toString()}`;
            pingsFetchPromise = (async () => {
                let res;
                try { res = await fetch(url, { credentials: "include" }); } catch (e) {
                    forcedLocal = true;
                    return fetchFromLocal();
                }
                if (res.status === 200) {
                    const data = await res.json();
                    if (curPaginating) {
                        if (data.pings.length < pageReqSize) {
                            curPaginating = false;
                        }
                        if (data.pings.length > 0) {
                            const oldestPing = data.pings[data.pings.length - 1];
                            paginateStart = oldestPing.time - 1;
                        }
                    }
                    forcedLocal = false;
                    const crit = getCrit();
                    return {
                        rows: (append ? pings : []).concat(data.pings.filter(row => pingFilter(row, crit))),
                        totalUnfiltered: totalUnfiltered + data.pings.length,
                    };
                } else if (res.status === 403) {
                    location.href = "/";
                    forcedLocal = false;
                    return { rows: [], totalUnfiltered: 0 };
                } else {
                    alert("Failed to load pings from server. Try again later.");
                }
            })();
            overallStats = await overallPingStats();
        }
        console.log(await pingsFetchPromise)
        const { rows, totalUnfiltered: newTotalUnfiltered } = await pingsFetchPromise;
        totalUnfiltered = newTotalUnfiltered;
        rowsTime = rows.reduce((prev, cur) => prev + (cur.interval), 0);
        pings = rows;
        loading = false;
        return rows;
    }
    fetchDbData().then(pingsChanged);
    export let rowsTime = null;
    function listenToDb() {
        let listener = async (modifications, primKey, obj, transaction) => {
            if (transaction.storeNames !== ["pings"]) return;
            // just redo the whole thing
            loading = true;
            await fetchDbData();
        };
        db.pings.hook("updating", listener);
        return {
            destroy() {
                db.pings.hook("updating").unsubscribe(listener);
            }
        }
    }
    listenToDb();
    function updateFilter() {
        paginateStart = null; // reset pagination
        loading = true;
        curPaginating = paginate;
        fetchDbData().then(pingsChanged);
    }

    const dispatcher = createEventDispatcher();
    function critChange() {
        if (justcrit) updateFilter();
        dispatcher("change");
    }
</script>

<style>
    .warning {
        font-weight: bold;
    }

    .warning-block {
        display: block;
        background: #d8d800;
    }

    :global(.dark) .warning-block {
        background: #696900;
    }
</style>

<div>
    <details {open}>
        <summary>
            Filtering options
        </summary>
        <select bind:value={includeType}>
            <option value="some">At least one of:</option>
            <option value="all">All of:</option>
        </select>
        <TagEntry on:input={critChange} bind:tags={includedTags} />
        None of:
        <TagEntry on:input={critChange} bind:tags={excludedTags} />
        {#if !norange}
            Date range:
            <DateRangePicker bind:range />
            <br>
        {/if}
        {#if (backend() === MINI_BACKEND) && !forcedLocal && !justcrit}
            <label for="cntpings-paginate">
                Paginate
            </label>
            <input id="cntpings-paginate" type="checkbox" bind:checked={paginate} on:input={critChange} >
            <br>
        {/if}
        {#if !justcrit}
            <button on:click={updateFilter}>Update selected pings</button>
        {/if}
    </details>
    {#if justcrit}
        {#if overallStats && totalUnfiltered}
            That would match
            {((pings.length / totalUnfiltered) * 100).toFixed(2)}%
            of the last
            {totalUnfiltered}
            pings.
        {/if}
    {:else}
        <div>
            Showing {pings.length} out of {overallStats ? overallStats.total : "..."}
            {#if overallStats && (overallStats.total !== 0)}
                pings ({((pings.length / (overallStats.total)) * 100).toFixed(2)}%).
            {:else}
                pings.
            {/if}
        </div>
        <div>
            Time: {humanizeDuration(rowsTime * 1000, { round: true })}
        </div>
    {/if}
</div>

{#if !loading && !justcrit}
    {#if forcedLocal}
        <div class="warning-block">
            <span class="warning">Warning</span>:
            Unable to connect to the server to download latest pings.
            The displayed pings might be out of sync.
            Make sure you're connected to the Internet.
        </div>
    {/if}
    {#if curPaginating && !forcedLocal}
        <div class="warning-block">
            <span class="warning">Warning</span>:
            Not all pings are being shown.
            You can cause all pings to be shown by unchecking Paginate in the filtering options, then clicking Update, however this may result in downloading a lot of data.
        </div>
    {/if}
{/if}
