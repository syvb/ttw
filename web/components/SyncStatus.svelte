<script>
    if (window.anyPendingSync === undefined) window.anyPendingSync = false;
    let pending = window.anyPendingSync;
    function pingsPendingSyncChange(e) {
        console.log("Any pending?", e.detail.anyPending);
        window.anyPendingSync = e.detail.anyPending;
        pending = window.anyPendingSync;
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
        class:statcircle-offline={!online && pending}
        class:statcircle-pending={online && pending}
        class:statcircle-synced={!pending}
    ></span>
    {#if !online && pending}
        Offline
    {:else if online && pending}
        Pending sync...
    {:else}
        Synced
    {/if}
</span>
