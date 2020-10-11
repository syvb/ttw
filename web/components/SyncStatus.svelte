<script>
    let anyPendingSync = false;
    function pingsPendingSyncChange(e) {
        console.log("Any pending?", e.detail.anyPending);
        anyPendingSync = e.detail.anyPending;
    }

    let online = navigator.onLine;
    window.addEventListener("online", () => online = navigator.onLine);
    window.addEventListener("offline", () => online = navigator.onLine);
</script>

<style>
    .statcircle-offline {
        color: rgb(133, 6, 6);
    }
    .statcircle-pending {
        color: rgb(156, 156, 0);
    }
    .statcircle-synced {
        color: rgb(0, 104, 0);
    }
    .sync-status-root {
        margin-bottom: 0.25rem;
        margin-left: 8px;
        margin-top: 8px;
    }
</style>

<svelte:window on:pings-pending-sync-change={pingsPendingSyncChange} />

<div class="sync-status-root">
    <span
        class="statcircle"
        class:statcircle-offline={!online && anyPendingSync}
        class:statcircle-pending={online && anyPendingSync}
        class:statcircle-synced={!anyPendingSync}
    >⬤</span>
    {#if !online && anyPendingSync}
        Offline
    {:else if online && anyPendingSync}
        Pending sync...
    {:else}
        Synced
    {/if}
</div>
