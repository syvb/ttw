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
    .statcircle {
        display: inline-block;
        width: 1rem;
        height: 1rem;
        border-radius: 50%;
        position: relative;
        top: 0.2rem;
    }
    .statcircle-offline {
        background: #f30000;
    }
    .statcircle-pending {
        background: #fdce34;
    }
    .statcircle-synced {
        background: #09da00;
    }
    @media (max-width: 430px) {
        .status-text {
            display: none;
        }
    }
</style>

<svelte:window on:pings-pending-sync-change={pingsPendingSyncChange} />

<span class="sync-status-root">
    <span
        class="statcircle"
        class:statcircle-offline={!online && pending}
        class:statcircle-pending={online && pending}
        class:statcircle-synced={!pending}
    > </span>
    <span class="status-text">
        {#if !online && pending}
            Offline
        {:else if online && pending}
            Syncing
        {:else}
            Synced
        {/if}
    </span>
</span>
