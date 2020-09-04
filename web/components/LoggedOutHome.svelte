<script>
    import { Link } from "svelte-routing";
    import { signIn } from "../sync.ts";
    import config from "../../config.json";
</script>

<style>
    h1 {
        font-size: 3rem;
        margin: 1rem;
        margin-left: 0;
        margin-right: 0;
    }
    .tagline {
        font-weight: bold;
        font-size: 2.2rem;
    }
</style>

<h1>TagTime Web</h1>

<div class="tagline">
    Time tracking that samples you randomly
</div>

<p>
    TagTime Web is a time-tracking web app. At random points throughout the day, it asks you what you are doing.
</p>

<p>
    {@html config["extra-homepage-text"] || ""}
</p>

<a href={config["api-server"] + "/internal/login"}>Login</a>
or
<a href={config["api-server"] + "/internal/register"}>Sign up</a>
