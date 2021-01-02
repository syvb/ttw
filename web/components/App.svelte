<script>
    import { Router, Link, Route } from "svelte-routing";
    import Home from "./Home.svelte";
    import Settings from "./Settings.svelte";
    import FillPings from "./FillPings.svelte";
    import CntpingsPage from "./CntpingsPage.svelte";
    import WelcomePage from "./WelcomePage.svelte";
    import GoalsPage from "./GoalsPage.svelte";
    import GoalPage from "./GoalPage.svelte";
    import NewGoalPage from "./NewGoalPage.svelte";
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
    const loadTime = Date.now() - (window.loadStart || 0);
    console.log("loaded in", loadTime);
    if (loadTime < 300) {
        // make transition faster if we load really quick
        // document.getElementById("loading-msg").style.transition = "0.2s opacity";
    }
    document.getElementById("loading-msg").style.opacity = 0;
    setTimeout(() => {
        document.getElementById("loading-msg").style.display = "none";
    }, 350);
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
    :global(.app-root) {
        /* creates a new context that top/bottom/left/right is evaluated to */
        position: relative;
        /* just enough room left for the footer */
        min-height: calc(100vh - 4rem - 1px);
        padding-bottom: 1rem;
    }
    footer {
        margin-left: 8px;
        margin-right: 8px;
        margin-top: 1rem;
        border-top: 2px solid gray;
        padding-top: 1rem;
        position: absolute;
        bottom: -3rem;
        padding-bottom: 1rem;
    }
</style>


<div class="app-root">
    <Router {url}>
        <div>
            <!-- Keep in sync with regex in ServiceWorker -->
            <Route path="/settings">
                <LoggedInNavbar {username} />
                <FillPings /><SyncStatus />
                <Settings />
            </Route>
            <Route path="/">
                {#if window.loginState !== "out"}
                    <LoggedInNavbar {username} />
                    <FillPings /><SyncStatus />
                {/if}
                <Home />
            </Route>
            <Route path="/cntpings">
                <LoggedInNavbar {username} />
                <FillPings /><SyncStatus />
                <CntpingsPage />
            </Route>
            <Route path="/welcome">
                <WelcomePage />
            </Route>
            <Route path="/graphs">
                <GraphsPage />
            </Route>
            <Route path="/goals">
                <LoggedInNavbar {username} />
                <FillPings /><SyncStatus />
                <GoalsPage />
            </Route>
            <Route path="/goals/info">
                <LoggedInNavbar {username} />
                <FillPings /><SyncStatus />
                <GoalPage />
            </Route>
            <Route path="/goals/new">
                <LoggedInNavbar {username} />
                <FillPings /><SyncStatus />
                <NewGoalPage />
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
                <LoggedInNavbar {username} {url} />
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
        <script async defer src="https://scripts.simpleanalyticscdn.com/latest.js"></script>
        <!-- not including noscript since by this point JS must be enabled -->
    {/if}
</div>
