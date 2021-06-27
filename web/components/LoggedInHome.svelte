<script>
    import NotificationsPerm from "./NotificationsPerm.svelte";
    import UpdateNotifier from "./UpdateNotifier.svelte";
    import Tip from "./Tip.svelte";
    export let swPending;
    export let anyPending;
    let lastTagTime = new Date(window.taglogic.last_ping_u32(Math.floor(Date.now() / 1000), window.pintData) * 1000);
    function pingUpdate(e) {
        console.assert(typeof e.lastPing === "number", "lastPing should be a number");
        lastTagTime = new Date(e.lastPing * 1000);
    }
    let timeAgo = Date.now() - (+lastTagTime);
    setInterval(() => timeAgo = Date.now() - (+lastTagTime), 250);
    function secsToTime(ms) {
        const secs = Math.floor(ms / 1000);
        if (secs === 0) return `now`;
        if (secs < 60) return (secs === 1) ? `1 second ago` : `${secs} seconds ago`;
        const mins = secs / 60;
        if (mins < 60) return `${mins.toFixed(1)} minutes ago`;
        const hours = mins / 60;
        const hoursMins = ((hours - Math.floor(hours)) * 60).toFixed(1);
        if (Math.floor(hours) === 1) {
            return `1 hour, ${hoursMins} minutes ago`;
        } else {
            return `${Math.floor(hours)} hours, ${hoursMins} minutes ago`;
        }
    }
</script>

<style>
    .bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-size: cover;
        /* https://mycolor.space/gradient3?ori=to+right+top&hex=%233DD1EB&hex2=%231AC87C&hex3=%236BE8D3&submit=submit */
        background: linear-gradient(to right top, #3dd1eb, #00d1de, #00d1ce, #00cfb9, #00cda1, #12ce9d, #1ed099, #28d195, #37d7a6, #47ddb6, #59e3c5, #6be8d3);
        z-index: -10;
    }

    :global(.dark) .bg {
        background: linear-gradient(to right top, #1b7787, #00747c, #007070, #006c62, #006853, #03654d, #066246, #0a5f40, #065d41, #035b42, #015843, #005644);
    }

    #maincontent {
        font-size: 1.1rem;
    }

    #maincontent.any-pending {
        display: block;
        height: unset;
    }

    @media (max-width: 425px) {
        #maincontent {
            font-size: 1rem;
        }
    }
</style>

<svelte:window on:pingUpdate={pingUpdate} />

<div id="maincontent" class:any-pending={anyPending}>
    <div class="home-info">
        <div>
            Last tag: {lastTagTime.toLocaleTimeString()} ({secsToTime(timeAgo)})
        </div>

        {#if window.miniData && window.miniData.total}
            <div>
                Total pings answered: {window.miniData.total}
            </div>
        {/if}

        <NotificationsPerm alwaysShow={false} />

        <Tip />

        <UpdateNotifier {swPending} />
    </div>

    {#if !anyPending}
        <div class="bg" style={localStorage['retag-bg'] ? `background-image: url(${localStorage['retag-bg']});` : ""}></div>
    {/if}
</div>
