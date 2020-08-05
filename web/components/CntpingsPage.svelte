<script>
    import Loading from "./Loading.svelte";
    import TagEntry from "./TagEntry.svelte";
    import DateRangePicker from "./DateRangePicker.svelte";
    import tagColor from "../tagColor.ts";
    import { overallPingStats, putPings } from "../pings.ts";
    import debounce from "../debounce.ts";
    import humanizeDuration from "humanize-duration";
    import { afterUpdate } from "svelte";
    import { backend, MINI_BACKEND, FULL_BACKEND } from "../backend.ts";
    const config = require("../../config.json");

    const PAGE_REQ_SIZE = 100;

    let includedTags = [];
    let excludedTags = [];
    let range = [];
    let smaller = false;
    let showMoreDisabled = false;
    let paginate = backend() === MINI_BACKEND;
    let curPaginating = paginate;
    let paginateStart = null;
    let forcedLocal = false;

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
            if (range.length === 2) queryStringParams.set("startTime", range[0]);
            if (curPaginating && (paginateStart !== null)) {
                queryStringParams.set("endTime", paginateStart);
            } else if (range.length === 2) {
                queryStringParams.set("endTime", range[1]);
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
                        } else {
                            const oldestPing = data.pings[data.pings.length - 1];
                            paginateStart = oldestPing.time;
                        }
                    }
                    forcedLocal = false;
                    return (append ? await rowsPromise : []).concat(data.pings.filter(pingFilter));
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
        curPaginating = paginate;
        return rows;
    }
    let rowsPromise = fetchDbData();
    rowsPromise.then(checkTableSize);
    let rowsTime = null;
    function listenToDb() {
        let listener = async (modifications, primKey, obj, transaction) => {
            if (transaction.storeNames !== ["pings"]) return;
            if (!(rowsPromise instanceof Promise) && rowsPromise[primKey].modified)
                // just redo the whole thing
                rowsPromise = await fetchDbData();
            checkTableSize();
        };
        db.pings.hook("updating", listener);
        return {
            destroy() {
                db.pings.hook("updating").unsubscribe(listener);
            }
        }
    }
    listenToDb();
    function rowInputComplete(e) {
        this.blur();
    }
    function updateFilter() {
        paginateStart = null; // reset pagination
        rowsPromise = fetchDbData();
        rowsPromise.then(checkTableSize);
    }
    let lastDbUpdate = Promise.resolve();
    const updateRow = i => debounce(async e => {
        [rowsPromise] = await Promise.all([rowsPromise, lastDbUpdate]);
        const newPing = {
            ...rowsPromise[i],
            tags: e.detail,
        };
        lastDbUpdate = putPings([newPing]);
        rowsPromise[i].tags = e.detail;
        rowsPromise[i].modified = true;
    }, 1800);

    let tbodyEle;
    let tableEle;
    let updatingTableSize = false;
    function checkTableSize() {
        updatingTableSize = true;
        if (!tableEle || !tbodyEle || tbodyEle.children.length === 0) {
            smaller = false;
            updatingTableSize = false;
            return;
        }
        const biggestTagInputWidth = Math.max.apply(null, [...tbodyEle.children].map(tr => tr.children[1].clientWidth));
        const width = biggestTagInputWidth + (16 * 12) + 16;
        if (window.innerWidth < width) {
            tableEle.classList.add("smaller");
        } else {
            tableEle.classList.remove("smaller");
        }
        updatingTableSize = false;
    }
    afterUpdate(() => {
        if (!updatingTableSize) checkTableSize()
    });

    async function showMore() {
        showMoreDisabled = true;
        rowsPromise = await fetchDbData(true);
        showMoreDisabled = false;
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

    .warning {
        font-weight: bold;
    }

    .warning-block {
        display: block;
        background: #d8d800;
    }
</style>

<svelte:window on:resize={checkTableSize} />

<div>
    <h1>Pings</h1>
    <div>
        Click on a row to edit it.
    </div>
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
    {#await rowsPromise}
        <Loading />
    {:then rows}
        <div>
            Showing {rows.length} out of {overallStats.total}
            {#if overallStats.total !== 0}
                pings ({((rows.length / (overallStats.total)) * 100).toFixed(2)}%).
            {:else}
                pings.
            {/if}
        </div>
        <div>
            Time: {humanizeDuration(rowsTime * 1000, { round: true })}
        </div>
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
        <table class:smaller bind:this={tableEle}>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Pings</th>
                </tr>
            </thead>
            <tbody bind:this={tbodyEle}>
                {#each rows as row, i}
                    <tr>
                        <td class="time-cell">{new Date(row.time * 1000).toLocaleString()}</td>
                        <td>
                            <TagEntry on:input={updateRow(i)} on:inputComplete={rowInputComplete} tags={row.tags} />
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
        {#if curPaginating && !forcedLocal}
            <button class="show-more" disabled={showMoreDisabled} on:click={showMore}>Show more...</button>
        {/if}
    {/await}
</div>
