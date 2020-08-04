<script>
    import NotificationsPerm from "./NotificationsPerm.svelte";
    import Tip from "./Tip.svelte";
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

<svelte:window on:pingUpdate={pingUpdate} />

<div>
    Last tag: {lastTagTime.toLocaleTimeString()} ({secsToTime(timeAgo)}).
</div>

<NotificationsPerm alwaysShow={false} />

<Tip />
