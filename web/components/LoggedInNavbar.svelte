<script>
    import { Link, link } from "svelte-routing";
    import config from "../../config.json";
    export let username;
</script>

<style>
    .signout-form {
        display: inline;
    }

    .username {
        font-weight: bold;
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
</style>

<a class="skip-link" href="#maincontent">
    Skip Navigation
</a>

<nav>
    <Link to="/">Home</Link>
    <Link to="/cntpings">Pings</Link>
    <Link to="/goals">Goals</Link>
    <Link to="/settings">Settings</Link>
    <a href="/graphs" target="graphs" use:link>Graphs (beta)</a>
    {#if window.loginState === "in"}
        {#if username}
            Logged in as <span class="username">{username}</span>.
        {/if}
        <form class="signout-form" action={`${config["api-server"]}/logout`} method="POST">
            <input type="submit" value="Sign out">
        </form>
    {/if}
</nav>
