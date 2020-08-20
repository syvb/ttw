<script>
    import DateRangePicker from "./DateRangePicker.svelte";
    import TagEntry from "./TagEntry.svelte";
    import { backend, MINI_BACKEND, FULL_BACKEND } from "../backend.ts";
    import humanizeDuration from "humanize-duration";
    import { overallPingStats } from "../pings.ts";
    const config = require("../../config.json");

    export let pings = [];
    export let loading = true;
    export const showMorePings = function () {
        const promise = fetchDbData(true);
        promise.then(pingsChanged);
        return promise;
    }
    export let pingsChanged = () => {};

    let includedTags = [];
    let excludedTags = [];

    const PAGE_REQ_SIZE = 100;

    let range = [];
    let paginate = backend() === MINI_BACKEND;
    export let curPaginating = paginate;
    let paginateStart = null;
    export let forcedLocal = false;

    function pingFilter(row) {
        if (includedTags.length > 0) {
            let anyIncluded = false;
            row.tags.forEach(tag => {
                if (includedTags.includes(tag)) anyIncluded = true;
            });
            if (!anyIncluded) return false;
        }
        if (!row.tags.every(tag => !excludedTags.includes(tag))) return false;
        let rowDate = row.time * 1000;
        if (range.length === 2) {
            if (rowDate < +range[0]) return false;
            if (rowDate > +range[1]) return false;
        }
        return true;
    }

    async function fetchFromLocal() {
        return window.db.pings
            .orderBy("time")
            .reverse()
            .filter(pingFilter)
            .toArray();
    }

    let overallStats = { total: 0, totalTime: 0 };

    // when append = true be very careful to avoid deadlock
    async function fetchDbData(append) {
        let pingsFetchPromise;
        if (backend() === FULL_BACKEND) {
            forcedLocal = false;
            pingsFetchPromise = fetchFromLocal();
        } else if (backend() === MINI_BACKEND) {
            const queryStringParams = new URLSearchParams();
            queryStringParams.set("no204", "1");
            if (curPaginating) queryStringParams.set("limit", PAGE_REQ_SIZE);
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
                        if (data.pings.length < PAGE_REQ_SIZE) {
                            curPaginating = false;
                        }
                        if (data.pings.length > 0) {
                            const oldestPing = data.pings[data.pings.length - 1];
                            paginateStart = oldestPing.time - 1;
                        }
                    }
                    forcedLocal = false;
                    return (append ? pings : []).concat(data.pings.filter(pingFilter));
                } else if (res.status === 403) {
                    location.href = "/";
                    forcedLocal = false;
                    return [];
                } else {
                    alert("Failed to load pings from server. Try again later.");
                }
            })();
            overallStats = await overallPingStats();
        }
        const rows = await pingsFetchPromise;
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
</script>

<style>
    .warning {
        font-weight: bold;
    }

    .warning-block {
        display: block;
        background: #d8d800;
    }
</style>

<div>
    <details>
        <summary>
            Filtering options
        </summary>
        Include tags:
        <TagEntry bind:tags={includedTags} />
        Exclude tags:
        <TagEntry bind:tags={excludedTags} />
        Date range:
        <DateRangePicker bind:range />
        <br>
        {#if (backend() === MINI_BACKEND) && !forcedLocal}
            <label for="cntpings-paginate">
                Paginate
            </label>
            <input id="cntpings-paginate" type="checkbox" bind:checked={paginate}>
            <br>
        {/if}
        <button on:click={updateFilter}>Update</button>
    </details>


    <div>
        Showing {pings.length} out of {overallStats.total}
        {#if overallStats.total !== 0}
            pings ({((pings.length / (overallStats.total)) * 100).toFixed(2)}%).
        {:else}
            pings.
        {/if}
    </div>
    <div>
        Time: {humanizeDuration(rowsTime * 1000, { round: true })}
    </div>
</div>

{#if !loading}
    {#if forcedLocal}
        <div class="warning-block">
            <span class="warning">Warning</span>:
            Unable to connect to the server to download latest pings.
            The displayed pings might be out of sync.
            This is probably due to a lack of connection to the Internet.
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
