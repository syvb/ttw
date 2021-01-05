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
        color: #f30000;
    }
    .statcircle-pending {
        color: #fdce34;
    }
    .statcircle-synced {
        color: #09da00;
    }
</style>

<svelte:window on:pings-pending-sync-change={pingsPendingSyncChange} />

<span class="sync-status-root">
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
</span>
