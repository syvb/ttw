import { precacheAndRoute } from "workbox-precaching";
import { subWithReg } from "./push.ts";
import "./init-db.ts";
import { latestPing } from "./pings.ts";

const manifest = self.__WB_MANIFEST.filter(page => !page.url.includes("logo/") && !page.url.includes(".git") && !page.url.includes("robots.txt") && !page.url.includes("stackedit.css") && !page.url.includes(".png") && !page.url.includes("disclaimer.txt")).concat([
    { url: "media/d1.mp3", revision: "1" },
    { url: "media/d2.mp3", revision: "1" },
    { url: "media/d3.mp3", revision: "1" },
]);
precacheAndRoute(
    manifest,
    {
        urlManipulation: ({ url }) => {
            console.log("checking", url);
            if (url.pathname.match(/^\/(app|settings|cntpings|welcome|graphs(\/.+)?)\/?$/)) {
                console.log("match");
                return [new URL("/index.html", location.href)];
            }
            return [];
        }
    }
);

async function onActivate() {
    const notifsInfo = await self.db.keyVal.get("notifs");
    if (!notifsInfo || !notifsInfo.value) return;
    await subWithReg(self.registration);
}

self.addEventListener("activate", event => {
    event.waitUntil(onActivate());
});

// notifications
self.addEventListener("pushsubscriptionchange", function (event) {
    console.log("Subscription expired");
    event.waitUntil(
        subWithReg(self.registration)
    );
});

async function handleNotificationClick() {
    console.log("Notification clicked");
    if (!self.clients || !clients.matchAll) {
        console.log("but we don't support matchAll so not focusing");
    }
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    if (clients.length > 0) {
        clients[0].focus();
        clients[0].postMessage({
            includeUncontrolled: true,
            id: "tag-focus",
        });
    } else {
        clients.openWindow("/app").then(windowClient => windowClient ? windowClient.focus() : null);
    }
}
self.addEventListener("notificationclick", async event => {
    event.waitUntil(handleNotificationClick());
});

async function handlePush(event) {
    const pushData = event.data.json();
    console.log("got push", pushData);
    if (pushData.type === "ping") {
        let lastPingData = null;
        try {
            // sometimes we get errors from Dexie about the DB being closed, so in that case just ignore it
            lastPingData = await latestPing();
        } catch (e) {
            console.warn("Got Dexie error, ignoring", e);
        }
        // have we already responded to the ping? if so ignore the push
        // sometimes this causes browsers to display a notification anyways, but we can't stop that
        if ((lastPingData !== null) && (lastPingData.time >= pushData.latestPing)) return;
        registration.showNotification(`Ping! ${new Date(pushData.latestPing * 1000).toLocaleTimeString().split(" ")[0]}`, {
            lang: "en",
            renotify: true,
            tag: "retag-ping",
        });
    }
}

self.addEventListener("push", function (event) {
    event.waitUntil(handlePush(event));
});
