<script>
    import { Link } from "svelte-routing";
    if (localStorage["retag-seen-welcome"] === "1") {
        location.replace("/");
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
    <h1>Welcome to TagTime Web!</h1>
    <p>
        Thanks for signing up!
    </p>
    <p>
        By default, you will get pinged every 45 minutes.
        However, you can change this in <a href="/settings">your settings</a>.
    </p>
    <a href="/">Get started!</a>
</main>
