<script>
    import DateRangePicker from "./DateRangePicker.svelte";
    import TagEntry from "./TagEntry.svelte";
    import { backend, MINI_BACKEND, FULL_BACKEND } from "../backend.ts";
    import humanizeDuration from "humanize-duration";
    import { overallPingStats } from "../pings.ts";
    const config = require("../../config.json");

    export let pings = [];
    export let loading = true;
    export const showMorePings = async function () {
        await fetchDbData(true);
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
                    // TODO: sort pings here
                    if (curPaginating) {
                        if (data.pings.length < PAGE_REQ_SIZE) {
                            curPaginating = false;
                        } else {
                            const oldestPing = data.pings[data.pings.length - 1];
                            paginateStart = oldestPing.time;
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
        curPaginating = paginate;
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
        fetchDbData().then(pingsChanged);
    }
</script>

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
