<script>
    import { link } from "svelte-routing";
    import { onMount } from "svelte";
    import SyncStatus from "./SyncStatus.svelte";
    import FillPings from "./FillPings.svelte";
    import config from "../../config.json";
    export let username;
    export let url;
    let homeLink, pingsLink, settingsLink, graphsLink, goalsLink;
    let mounted = false;

    function updateBar() {
        if (!mounted) return;
        console.log("updating navbar");
        const pathPart = location.pathname.toLowerCase();
        let ele = null;
        switch (pathPart) {
            case "/app":
            case "/":
                ele = homeLink;
                break;
            case "/cntpings":
                ele = pingsLink;
                break;
            case "/settings":
                ele = settingsLink;
                break;
            case "/graphs":
                ele = graphsLink; // actually unused
                break;
            case "/goals": case "/goals/new": case "/goals/info":
                ele = goalsLink;
                break;
        }
        homeLink.classList.remove("loggedintop-active");
        pingsLink.classList.remove("loggedintop-active");
        settingsLink.classList.remove("loggedintop-active");
        graphsLink.classList.remove("loggedintop-active");
        if (ele) ele.classList.add("loggedintop-active");
    }

    $: url, updateBar();
    onMount(() => {
        mounted = true;
        updateBar();
    });
</script>

<style>
    .signout-form {
        display: inline;
    }

    .username {
        font-weight: 500;
    }

    .skip-link {
        position: absolute;
        left: -9999px;
        width: 1px;
        height: 1px;
        top: auto;
    }

    .skip-link:focus {
        display: inline-block;
        height: auto;
        width: auto;
        position: static;
        margin: auto;
    }

    nav {
        padding: 8px;
        padding-bottom: 10px;
        padding-right: 0.5rem;
        background: #005644;
        color: rgb(199, 241, 234);
    }

    .navlink {
        text-decoration: none;
        color: rgb(199, 241, 234);
        margin-right: .3rem;
    }

    :global(.loggedintop-active) {
        font-weight: bold;
        /* to override the more specific .svelte-blah.navbar */
        color: white !important;
    }

    .auth-info {
        float: right;
    }

    nav :global(.sync-status-root) {
        float: right;
        margin-right: 1rem;
    }

    @media (max-width: 460px) {
        .navlink {
            margin-right: 0.15rem;
        }
        nav :global(.sync-status-root) {
            margin-right: 0.333rem;
        }
    }

    @media (max-width: 365px) {
        nav {
            height: 2rem;
        }
    }
</style>

<a class="skip-link" href="#maincontent">
    Skip Navigation
</a>

<nav>
    <a bind:this={homeLink} class="navlink" use:link href="/app">Home</a>
    <a bind:this={pingsLink} class="navlink" use:link href="/cntpings">Pings</a>
    <a bind:this={graphsLink} class="navlink" href="/graphs" target="graphs" use:link>Graphs</a>
    <a bind:this={goalsLink} class="navlink" use:link href="/goals">Goals</a>
    <a bind:this={settingsLink} class="navlink" use:link href="/settings">Settings</a>
    {#if window.loginState === "in"}
        <span class="auth-info">
            {#if username}
                Logged in as <span class="username">{username}</span>.
            {/if}
            <form class="signout-form" action={`${config["api-server"]}/logout`} method="POST">
                <input type="submit" value="Sign out">
            </form>
        </span>
    {/if}
    <SyncStatus />
</nav>

<FillPings />
