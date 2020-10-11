<script>
    import { link } from "svelte-routing";
    import { onMount } from "svelte";
    import config from "../../config.json";
    export let username;
    export let url;
    let homeLink, pingsLink, settingsLink, graphsLink;
    let mounted = false;

    function updateBar() {
        if (!mounted) return;
        console.log("updating navbar");
        const pathPart = location.pathname.toLowerCase();
        let ele = null;
        switch (pathPart) {
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
        }
        homeLink.classList.remove("loggedinnavbar-active");
        pingsLink.classList.remove("loggedinnavbar-active");
        settingsLink.classList.remove("loggedinnavbar-active");
        graphsLink.classList.remove("loggedinnavbar-active");
        if (ele) ele.classList.add("loggedinnavbar-active");
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
        padding-bottom: 4px;
        margin-bottom: 4px;
        background: rgb(0, 100, 79);
        color: rgb(199, 241, 234);
    }

    .navlink {
        text-decoration: none;
        color: rgb(199, 241, 234);
        margin-right: .3rem;
    }

    :global(.loggedinnavbar-active) {
        font-weight: bold;
        /* to override the more specific .svelte-blah.navbar */
        color: white !important;
    }
</style>

<a class="skip-link" href="#maincontent">
    Skip Navigation
</a>

<nav>
    <a bind:this={homeLink} class="navlink" use:link href="/">Home</a>
    <a bind:this={pingsLink} class="navlink" use:link href="/cntpings">Pings</a>
    <a bind:this={graphsLink} class="navlink" href="/graphs" target="graphs" use:link>Graphs</a>
    <a bind:this={settingsLink} class="navlink" use:link href="/settings">Settings</a>
    {#if window.loginState === "in"}
        {#if username}
            Logged in as <span class="username">{username}</span>.
        {/if}
        <form class="signout-form" action={`${config["api-server"]}/logout`} method="POST">
            <input type="submit" value="Sign out">
        </form>
    {/if}
</nav>
