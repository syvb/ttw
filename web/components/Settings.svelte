<script>
    import { STR } from "../strings.ts";
    import { Link } from "svelte-routing";
    import NotificationsPerm from "./NotificationsPerm.svelte";
    import TagEntry from "./TagEntry.svelte";
    import download from "../download.ts";
    import { rebuildTagIndex } from "../tagIndex.ts";
    import { syncConfig } from "../sync.ts";
    import { onMount, onDestroy } from "svelte";
    import { toDurString, updatePint } from "../pint-update.ts";
    import { allPings, putPings } from "../pings.ts";
    import { beemResync } from "../beem.ts";
    import debounce from "../debounce.ts";
    import config from "../../config.json";

    if (window.loginState === "out") {
        location.href = "/";
    }

    const clearFail = () => alert("All data on this device has been deleted. However, there was an error deleting data from the server. As such, the data from the server may be re-synced once server communication is possible again. Please try deleting data again later.");
    async function deleteAllData(event) {
        const reallySure = confirm("Do you *really* want to delete everything? This will clear all data from your device and from the server. You might want to download your data first.");
        if (!reallySure) return;
        localStorage.clear();
        try { await window.db.delete(); } catch (e) { console.log("Error clearing DB", e); }
        let res;
        try {
            res = await fetch(config["api-server"] + "/db", {
                method: "DELETE",
                credentials: "include",
            });
            if (!(res.status === 204 || res.status === 200)) clearFail();
        } catch (e) {
            clearFail();
        }
        location.href = "/app";
    }

    const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    function genLine(r) {
        let line = `${r.time} ${r.tags.join(" ")}`;
        let extraSpaces = Math.max(1, 54 - line.length);
        line += " ".repeat(extraSpaces);
        const d = new Date(r.time * 1000);
        // we always use the full form here,
        // although actual TagTime will sometimes use shorter forms
        // (to ensure all lines are the same length)
        line += `[${d.getFullYear()}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getDate().toString().padStart(2, "0")} ${d.toTimeString().split(" ")[0]} ${DAY_NAMES[d.getDay()]}]`;
        return line;
    }

    let tagtimeExportPending = false;
    async function tagtimeExport() {
        tagtimeExportPending = true;
        const rows = await allPings();
        if (rows === null) {
            alert("Failed to fetch pings from server. Ensure you are connected to the Internet.");
            tagtimeExportPending = false;
            return;
        }
        const data = rows
            .map(r => genLine(r))
            .join("\n") + "\n"; // all files should end with trailing newline
        download(data, "text/plain", "tags.log");
        tagtimeExportPending = false;
    }

    function tryToPersist() {
        navigator.storage.persist();
    }

    function updatePingNoise() {
        localStorage["retag-audio"] = this.value;
        try {
            const ele = document.getElementById(`audio-${this.value}`);
            ele.play();
        } catch (e) { }
    }
    let pingNoise;

    let tagtimeImportPending = false;
    let ttImportButton;
    function endImport() {
        ttImportButton.value = "";
        tagtimeImportPending = false;
    }
    async function tagtimeImport() {
        if (ttImportButton.files.length === 0) return;
        tagtimeImportPending = true;
        const file = ttImportButton.files[0];
        // could use streams to improve performance, don't think it's needed though
        const text = await file.text();
        const allPings = text.split("\n").map(line => {
            line = line.trim();
            let parts = line.split(" ");
            if (parts.length < 2) return null; // at least "123 ["
            let time = parseInt(parts[0], 10);
            if (Number.isNaN(time)) return null;
            const humanTimeIndex = parts.findIndex(part => part.includes("["));
            const tags = parts
                .slice(1, humanTimeIndex)
                // normalize tag
                .map(tag => tag.trim().toLowerCase().replace(/"|'|\t/g, ""))
                .filter(tag => !tag.match(/^\W*$/));
            return {
                tags,
                time,
                category: null,
                interval: window.pintData.avg_interval,
                comment: null,
            };
        }).filter(ping => ping !== null);
        if (allPings.length === 0) {
            alert("No valid pings found.");
            endImport();
            return;
        }
        console.log(allPings);
        await putPings(allPings);
        alert(`Imported ${allPings.length} pings.`);
        endImport();
        location.reload();
    }
    function doTtImport() {
        ttImportButton.click();
    }
    let theme = localStorage["retag-theme"];
    function updateTheme() {
        theme = this.value;
        localStorage["retag-theme"] = theme;
        location.reload();
    }
    let useHomepageGradient = localStorage["retag-homepage-gradient"] === "1";
    function updateHomepageGradient() {
        useHomepageGradient = this.checked;
        localStorage["retag-homepage-gradient"] = ~~useHomepageGradient;
    }

    let pintAvgInterval = toDurString(window.pintData.avg_interval);
    let pintSeed = window.pintData.seed.toString();
    let pintAlgChecked = localStorage["retag-pint-alg"] === "tagtime";
    let pintChangePending = false;
    const SCHEDS = {
        "ttw-univ-sched": ["45:00", "12345", false],
        "univ-sched": ["45:00", "11193462", true],
    };
    function curSchedType() {
        const schedIds = Object.keys(SCHEDS);
        for (let i = 0; i < schedIds.length; i++) {
            const sched = SCHEDS[schedIds[i]];
            if (sched[0] === pintAvgInterval && sched[1] === pintSeed && sched[2] === pintAlgChecked) return schedIds[i];
        }
        return "custom";
    }
    let pingAlgDropdownVal = curSchedType();
    function pingAlgDropdownSelect() {
        const preset = SCHEDS[pingAlgDropdownVal];
        if (preset) {
            pintChangePending = true;
            updatePint(preset[0], preset[1], preset[2]);
        }
    }
    function updatePintClick() {
        pintChangePending = true;
        updatePint(pintAvgInterval, pintSeed, pintAlgChecked);
    }

    let afkTags = (localStorage["retag-afk-tags"] || "afk").split(" ");
    if (afkTags.length === 1 && afkTags[0] === "") afkTags = [];
    const afkTagsUpdate = debounce(event => {
        afkTags = event.detail;
        localStorage["retag-afk-tags"] = afkTags.join(" ");
        syncConfig([
            "retag-afk-tags",
        ]);
    }, 1750);
    onDestroy(() => {
        afkTagsUpdate.end();
    });

    function dbDownload() {
        location.href = `${config["api-server"]}/db`;
    }

    async function beemResyncClick() {
        const err = await beemResync();
        if (err) {
            alert(err);
        } else {
            alert("Started resyncing. It can take a few minutes for the syncing to complete in the background.");
        }
    }

    const TABS = [
        "ping-notifs",
        "import-export",
        "display",
        "account",
        "advanced",
    ];
    function updateTab() {
        const hash = location.hash.slice(1);
        let tab;
        if (TABS.includes(hash)) {
            tab = hash;
        } else {
            location.hash = "#ping-notifs";
            tab = "ping-notifs";
        }
        TABS.forEach(curTab => {
            const eles = [...document.getElementsByClassName("tab-" + curTab)];
            if (curTab === tab) {
                eles.forEach(ele => ele.classList.add("active"));
            } else {
                eles.forEach(ele => ele.classList.remove("active"));
            }
        });
    }

    onMount(() => {
        pingNoise = localStorage["retag-audio"] || "n";
        document.getElementById("homepage-gradient").checked = useHomepageGradient;
        updateTab();
    });
</script>

<style>
    h2 {
        margin: 0;
        margin-bottom: 1rem;
    }
    h3 {
        margin: 0;
        margin-top: 0.8rem;
    }

    .dz,
    .delete-button {
        color: rgb(141, 0, 0);
    }

    :global(.dark) .dz,
    :global(.dark) .delete-button {
        color: rgb(247, 2, 2);
    }

    .ding-info,
    .ding-audio-info {
        color: rgb(56, 56, 56);
    }

    :global(.dark) .ding-info,
    :global(.dark) .ding-audio-info {
        color: rgb(197, 197, 197);
    }

    .tt-import {
        /* apparently some browsers don't like display: none inputs */
        position: absolute;
        left: -1000px;
        top: -1000px;
    }

    #pint-interval {
        width: 3em;
    }

    #pint-seed {
        width: 10em;
    }

    #maincontent {
        margin: 8px;
    }

    summary {
        cursor: pointer;
    }

    .inner {
        margin-left: 13rem;
        margin-top: 1rem;
        position: relative;
        top: -31rem;
    }

    .sidebar {
        height: 30rem;
        width: 13rem;
        position: sticky;
        top: 0.5rem;
        display: flex;
        flex-direction: column;
        flex-wrap: wrap;
    }

    .sidebar > a {
        display: block;
        color: black;
        text-decoration: none;
        border: 2px solid #005644;
        border-radius: 3rem;
        padding: .5rem;
        margin-bottom: 0.5rem;
        cursor: pointer;
        background: #d4faf1;
        width: max-content;
        height: max-content;
    }

    /* .active is manipulated in JS, this is needed to supress dead style removal */
    .sidebar > :global(a.active) {
        background: #005644;
        color: white;
    }

    :global(.dark) .sidebar > a {
        color: white;
        background: #003c2f;
    }

    :global(.dark) .sidebar > :global(a.active) {
        background: #00aa86 !important;
        border-color: #00aa86;
        color: black;
    }

    @media (max-width: 820px) {
        .sidebar {
            flex-direction: row;
            width: 100%;
            height: unset;
        }
        .sidebar > a {
            margin-right: 0.5rem;
        }
        h2 {
            margin-right: 0.5rem;
            line-height: 1.6;
        }
        .inner {
            margin: 0;
            position: static;
        }
    }

    .inner > .tab {
        display: none;
    }

    /* .active is manipulated in JS, this is needed to supress dead style removal */
    .inner > :global(.tab.active) {
        display: block;
    }

    .imex-table td {
        padding-bottom: 0.5rem;
    }
</style>

<svelte:window on:hashchange={updateTab} />

<main id="maincontent">
    <div class="sidebar">
        <h2>Settings</h2>
        <a class="tab-ping-notifs" href="/settings#ping-notifs">Pings and notifications</a>
        <a class="tab-import-export" href="/settings#import-export">Imports/Exports</a>
        <a class="tab-display" href="/settings#display">Display</a>
        <a class="tab-account" href="/settings#account">Account</a>
        <a class="tab-advanced" href="/settings#advanced">Advanced</a>
    </div>

    <div class="inner">
        {#if !navigator.onLine}
            <div>
                Note: some settings cannot be changed while offline
            </div>
        {/if}

        <div class="tab tab-ping-notifs">
            <h3>Notifications</h3>
            <div>
                <NotificationsPerm />
            </div>
            <div>
                <label for="ping-noise">Audio to play on a ping: </label>
                <!-- I *think* using `change` is okay here  -->
                <!-- svelte-ignore a11y-no-onchange -->
                <select id="ping-noise" bind:value={pingNoise} on:change={updatePingNoise}>
                    <option value="n">None</option>
                    <option value="d3">Simple ding</option>
                    <option value="d1">Bell Arpeggio</option>
                    <option value="d2">Doorbell</option>
                </select>
                <div class="ding-audio-info">
                    {#if pingNoise === "n"}
                        No audio will be played.
                    {:else if pingNoise === "d1"}
                        It kinda sounds like some windchimes.
                        Apparently an &ldquo;arpeggio&rdquo; is a type of broken chord.
                        And a &ldquo;broken chord&rdquo; is a chord but broken up and maybe with some notes repeated.
                        Audio is from <a href="https://cynicmusic.com/" rel="noopener">The Cynic Project</a>.
                    {:else if pingNoise === "d2"}
                        Sounds like a doorbell. Ding-dong! Very confusing if this device is near a door. Audio is from
                        <a href="https://freesound.org/people/MatthewWong/" rel="noopener" title="Don’t get too excited about clicking this link. MatthewWong’s only upload to freesound.org is this doorbell sound. Which you’ve already heard if you’re hovering over this link.">MatthewWong</a>.
                    {:else if pingNoise === "d3"}
                        Sounds a bit futuristic (but not too futuristic).
                        Audio is from
                        <a href="https://freesound.org/people/robni7/" rel="noopener">robni7</a>.
                    {:else if pingNoise === "d1337"}
                        no
                    {:else}
                        Erm what? honestly I don&rsquo;t what know *what* will be played
                    {/if}
                </div>
                <div class="ding-info">
                    {#await window.supportsAutoplay then supported}
                        {#if !supported && (pingNoise !== "n")}
                            <div class="autoplay-warning">
                                Note: Your browser doesn&rsquo;t support automatically playing audio. It might be that you need to tap on the page before audio can play.
                            </div>
                        {/if}
                    {/await}
                </div>
            </div>

            <h3>Pinging</h3>
            <div>
                Automatically add these tags when you miss multiple pings:
                <TagEntry bind:tags={afkTags} on:input={afkTagsUpdate} small />
            </div>
            <div class="pint-alg">
                <div>
                    <label for="pint-dropdown">Ping schedule:</label>
                    <!-- svelte-ignore a11y-no-onchange -->
                    <select bind:value={pingAlgDropdownVal} on:change={pingAlgDropdownSelect} disabled={pintChangePending} id="pint-dropdown">
                        <option value="ttw-univ-sched">{STR.ttwUnivSched} (default)</option>
                        <option value="univ-sched">TagTime universal schedule</option>
                        <option value="custom">Custom...</option>
                    </select>
                </div>
                {#if pingAlgDropdownVal === "custom"}
                    <div class="pint-customization">
                        <div>
                            <div>
                                <label for="pint-interval">
                                    Average ping interval (format like 45:12 for a ping every 45 minutes and 12 seconds, changing this will disable notifications):
                                </label>
                                <input type="text" id="pint-interval" bind:value={pintAvgInterval} disabled={pintChangePending}>
                            </div>
                            <div>
                                {#if pintAlgChecked && (!(pintAvgInterval.trim() === "45:00" || pintAvgInterval.trim() === "45:0") || (pintSeed !== "1184097393"))}
                                    Note: You are are using the original TagTime algorithm but not the universal schedule.
                                    Performance will be degraded and notifications will not be sent (due to the lack of lookup tables).
                                {/if}
                            </div>
                        </div>
                        <div>
                            <label for="pint-seed">
                                Ping seed (changing this will disable notifications, see above warning for interval):
                            </label>
                            <input type="number" id="pint-seed" bind:value={pintSeed} disabled={pintChangePending}>
                        </div>
                        <div>
                            <input type="checkbox" id="pint-tt-alg" bind:checked={pintAlgChecked} disabled={pintChangePending}>
                            <label for="pint-tt-alg">
                                Use original TagTime algorithm
                            </label>
                            <details>
                                <summary>Read this before changing the above checkbox!</summary>
                                You should check this box if you want compatibility with the original TagTime.
                                Checking this checkbox will enable using the algorithm used by the original TagTime.
                                You can change the seed under advanced settings. Note that UR_PING is always 1184097393.
                                If you use the TagTime algorithm but not a seed of 11193462 and a gap of 45:00, then
                                performance will suffer and notifications won&rsquo;t work.
                            </details>
                        </div>
                        <div>
                            <button on:click={updatePintClick}>Update pinging settings</button>
                        </div>
                    </div>
                {/if}
                <div>
                    {STR.reloadNote}
                </div>
            </div>
        </div>

        <div class="tab tab-import-export">
            <table class="imex-table">
                <tbody>
                    <tr>
                        <td>
                            <label for="tt-import" class="tt-import-btn">
                                <button on:click={doTtImport} disabled={tagtimeImportPending}>
                                    Import from TagTime log
                                </button>
                            </label>
                            <input id="tt-import" class="tt-import" aria-hidden="true" tabindex="-1" type="file" on:change={tagtimeImport} bind:this={ttImportButton} disabled={tagtimeImportPending}>
                        </td>
                        <td>
                            Only adds pings, does not remove or overwrite existing pings. Invalid lines are ignored. Does not import interval settings. Assumes TagTime used the currently active interval.
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <button on:click={tagtimeExport} disabled={tagtimeExportPending}>Export as TagTime log</button>
                        </td>
                        <td>
                            This format is widely supported in the TagTime ecosystem.
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <button on:click={dbDownload}>Download SQLite database</button>
                        </td>
                        <td>
                            This is how your pings are internally repersented, specified by <a href="https://github.com/Smittyvb/ttw/blob/master/serv2/initUserDb.sql">a schema</a>.
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <button on:click={beemResyncClick} disabled={!localStorage["retag-beem-token"]}>Resync with Beeminder</button>
                        </td>
                        <td>
                            {#if localStorage["retag-beem-token"]}
                                Ensures Beeminder has all pings over the last 7 days.
                            {:else}
                                Connect to Beeminder in the <Link to="/goals">Goals tab</Link> to enable syncing with it.
                            {/if}
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <a href={config["api-server"] + "/internal/gentoken"}>Generate API token</a>
                        </td>
                        <td>
                            See the <a href="https://github.com/Smittyvb/ttw/blob/master/docs/api.md">API documentation</a> for more details. The API endpoint to use is <code>{config["api-server"]}/</code>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="tab tab-display">
            <div>
                <label for="theme-dropdown">Theme: </label>
                <select id="theme-dropdown" on:input={updateTheme}>
                    <option selected={theme === "default"} value="default">Browser default {(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "(dark)" : "(light)"}</option>
                    <option selected={theme === "dark"} value="dark">Dark</option>
                    <option selected={theme === "light"} value="light">Light</option>
                </select>
            </div>
            <div>
                <label for="homepage-gradient">Enable gradient on homepage: </label>
                <input type="checkbox" id="homepage-gradient" on:input={updateHomepageGradient} />
            </div>
        </div>

        <div class="tab tab-account">
            <div>
                <a href={config["api-server"] + "/internal/changepw"}>Change password</a>
            </div>
            <h3 class="dz">Danger Zone</h3>
            <div>
                <button on:click={deleteAllData} class="delete-button">Delete all data</button>
            </div>
            <div>
                You probably want to export your data in the Imports/Exports tab first. This will not delete your account. To delete your account, <a href={"mailto:" + config["contact-email"]}>contact support</a>.
            </div>

        </div>

        <div class="tab tab-advanced">
            <div>
                You probably don&rsquo;t want to touch any of the settings here.
            </div>
            <div>
                <button on:click={tryToPersist}>Request persistent storage</button>
            </div>
            <div>
                <button on:click={rebuildTagIndex}>Rebuild tag index</button>
            </div>
        </div>
    </div>
</main>
