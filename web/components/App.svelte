<script>
    import { Router, Link, Route } from "svelte-routing";
    import Home from "./Home.svelte";
    import Settings from "./Settings.svelte";
    import FillPings from "./FillPings.svelte";
    import CntpingsPage from "./CntpingsPage.svelte";
    import WelcomePage from "./WelcomePage.svelte";
    import LoggedInNavbar from "./LoggedInNavbar.svelte";
    import GraphsPage from "./GraphsPage.svelte";
    import SyncStatus from "./SyncStatus.svelte";
    import DayDistGraph from "./graphs/DayDist.svelte";
    import PingsScatterGraph from "./graphs/PingsScatter.svelte";
    import DailyTrendGraph from "./graphs/DailyTrend.svelte";
    import WeeklyTrendGraph from "./graphs/WeeklyTrend.svelte";
    import MonthlyTrendGraph from "./graphs/MonthlyTrend.svelte";
    import config from "../../config.json";
    export let url = "";
    export let username;
    export let buildInfo;
    document.getElementById("loading-msg").style.display = "none";
</script>

<style>
    :global(.fake-link, a) {
        color: rgb(0, 52, 194);
        text-decoration: underline;
        cursor: pointer;
    }
    :global(.dark .fake-link, .dark a) {
        color: rgb(92, 210, 255);
    }
    :global(body.dark) {
        background: black;
        color: white;
    }
    footer {
        margin-top: 1rem;
        border-top: 2px solid gray;
        padding-top: 1rem;
    }
    .app-root {
        margin: 8px;
    }
</style>


<div class="app-root">
    <Router {url}>
        <div>
            <!-- Keep in sync with regex in ServiceWorker -->
            <Route path="/settings">
                <LoggedInNavbar {username} />
                <SyncStatus />
                <FillPings />
                <Settings />
            </Route>
            <Route path="/">
                {#if window.loginState !== "out"}
                    <LoggedInNavbar {username} />
                    <SyncStatus />
                    <FillPings />
                {/if}
                <Home />
            </Route>
            <Route path="/cntpings">
                <LoggedInNavbar {username} />
                <SyncStatus />
                <FillPings />
                <CntpingsPage />
            </Route>
            <Route path="/welcome">
                <WelcomePage />
            </Route>
            <Route path="/graphs">
                <GraphsPage />
            </Route>
            <Route path="/graphs/day-dist">
                <DayDistGraph />
            </Route>
            <Route path="/graphs/pings-scatter">
                <PingsScatterGraph />
            </Route>
            <Route path="/graphs/trend/daily">
                <DailyTrendGraph />
            </Route>
            <Route path="/graphs/trend/weekly">
                <WeeklyTrendGraph />
            </Route>
            <Route path="/graphs/trend/monthly">
                <MonthlyTrendGraph />
            </Route>
            <Route>
                <LoggedInNavbar {username} />
                Page not found.
            </Route>
        </div>
        <footer>
            {buildInfo} |
            <a href="/disclaimer.txt">Attribution notices</a>
            {@html config["extra-footer-text"] || ""}
        </footer>
    </Router>
    {#if config.enableSimpleAnalytics}
        <script async defer src="https://cdn.simpleanalytics.io/hello.js"></script>
        <!-- not including noscript since by this point JS must be enabled -->
    {/if}
</div>
