<script>
    import { sub, unsub } from "../push.ts";

    export let alwaysShow = true;
    let notifSupported = true;
    if (!(window.Notification && window.ServiceWorker && window.PushManager)) notifSupported = false;
    let enabled = localStorage["retag-notifs"] === "1";
    let reason = "";
    let permStatus = window.Notification ? Notification.permission : "default";
    $: {
        switch (permStatus) {
            // we don't await db promises since this isn't an async function anyways
            case "denied":
                reason = ", because you have explictly disallowed notification permissions. You may need to click on the icon to the left of the URL bar, and manually enable notifications from there. Once you have done that, you should click the button";
                enabled = false;
                localStorage["retag-notifs"] = "";
                window.db.keyVal.put({ key: "notifs", value: "1" })
                break;
            case "default":
                reason = ", because you haven't granted permissions"
                enabled = false;
                localStorage["retag-notifs"] = "";
                window.db.keyVal.put({ key: "notifs", value: "1" })
                break;
            case "granted":
                break;
        }
    }
    async function enableNotifs() {
        if (!window.Notification) return console.warn("Notification enable attempted despite no Notification global");
        if (Notification.permission !== "granted") {
            const newStatus = await Notification.requestPermission();
            permStatus = newStatus;
        }
        if (permStatus === "granted") {
            await Promise.all([
                sub(),
                window.db.keyVal.put({ key: "notifs", value: "1" }),
            ]);
            localStorage["retag-notifs"] = "1";
            enabled = true;
            reason = "";
            new Notification("Example notification", { body: "This is what notifications will look like" });
        }
    }
    function disableNotifs() {
        // we don't wait for any promises here
        unsub();
        localStorage["retag-notifs"] = "";
        window.db.keyVal.delete("notifs");
        enabled = false;
        permStatus = Notification ? Notification.permission : "default";
    }
    if (notifSupported) {
        setInterval(() => {
            permStatus = Notification.permission;
        }, 7500);
    }

    let online = navigator.onLine;
    window.addEventListener("online", () => online = navigator.onLine);
    window.addEventListener("offline", () => online = navigator.onLine);
</script>

<!--
    Order:
    - If notifications aren't supported, don't show it.
    - If alwaysShow, show it.
    - If we are diabled and online, show it.
    - Don't show it.
-->
{#if notifSupported && ((!enabled && online) || alwaysShow)}
    Notifications are {enabled ? "enabled" : "disabled"} on this device{reason}.
    It can take up to a minute for changes to this setting to take effect.
    <button on:click={enabled ? disableNotifs : enableNotifs} disabled={!online}>{enabled ? "Disable" : "Enable"} notifications</button>
    {#if !online}
        <div>
            You must be online to change your notification settings.
        </div>
    {/if}
{:else if alwaysShow}
    Your device does not support native notifications.
{/if}