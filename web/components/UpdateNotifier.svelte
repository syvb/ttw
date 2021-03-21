<script>
    export let swPending;

    let updating = window.swPending;
    async function update() {
        if (updating) return;
        updating = true;
        window.swPending = true;
        const waiting = (await navigator.serviceWorker.ready).waiting;
        waiting.postMessage("earlyClaim");
    }
</script>

<style>
    .update-notif {
        background: #034c3d;
        cursor: pointer;
        color: white;
        width: fit-content;
        padding: 0.75rem;
        border-radius: 0.5rem;
        box-shadow: 0px 5px 4px 0px #00392d;
        margin: 1rem;
        display: none;
    }

    .shown {
        display: block;
    }
</style>

<div class="update-notif" on:click={update} class:shown={swPending || updating}>
    {#if updating}
        Updating...
    {:else}
        There's an update available. Click on me to update!
    {/if}
</div>
