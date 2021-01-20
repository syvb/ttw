<script>
    import { Link } from "svelte-routing";
    import { STR } from "../strings.ts";
    if (localStorage["retag-seen-welcome"] === "1") {
        location.replace("/app");
    } else {
        localStorage["retag-seen-welcome"] = "1";
    }
</script>

<style>
    #maincontent {
        margin: 8px;
    }
</style>

<main id="maincontent">
    <h1>{STR.welcome}</h1>
    <p>
        Thanks for signing up!
    </p>
    <p>
        By default, you will get pinged every 45 minutes.
        However, you can change this in <a href="/settings">your settings</a>.
    </p>
    <a href="/app">Get started!</a>
</main>
