<script>
    import { Link } from "svelte-routing";
    import { signIn } from "../sync.ts";
    import config from "../../config.json";
</script>

<style>
    
</style>

<h1>TagTime Web</h1>

<p>
    TagTime Web is a time-tracking web app. At random points throughout the day, it asks you what you are doing.
</p>
<a href={config["api-server"] + "/internal/login"}>Login</a>
or
<a href={config["api-server"] + "/internal/register"}>Sign up</a>