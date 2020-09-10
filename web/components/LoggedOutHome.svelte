<script>
    import { Link } from "svelte-routing";
    import { signIn } from "../sync.ts";
    import scrPing from "../media/scrping.png";
    import scrMatrix from "../media/scrmatrix.png";
    import scrDailyTrend from "../media/scrdailytrend.png";
    import scrAutoComplete from "../media/scrautocomplete.png";
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
    .scr {
        margin-left: 1.5rem;
    }
    @media (max-width: 580px) {
        .scr {
            width: 90vw;
            margin-left: 5vw;
        }
    }
    @media (max-width: 500px) {
        .scr {
            width: 98vw;
            margin-left: 0.5vw;
        }
    }
    .scr-graph {
        display: block;
        width: 1250px;
        margin-left: 1.5rem;
    }

    @media (max-width: 1300px) {
        .scr-graph {
            width: 90vw;
            margin-left: 5vw;
        }
    }
</style>

<h1>TagTime Web</h1>

<div class="tagline">
    Time tracking that samples you randomly
</div>

<p>
    <a href={config["api-server"] + "/internal/login"}>Login</a>
    or
    <a href={config["api-server"] + "/internal/register"}>Sign up</a>
</p>

<p>
    TagTime Web is an <a href="https://github.com/smittyvb/ttw">open-source</a> time-tracking web app. At random points throughout the day, it asks you what you are doing.
</p>

<p>
    Here's what it looks like when you get a ping:
</p>

<p>
    <img src={scrPing} alt="What a ping looks like" class="scr" />
</p>

<p>
    From there, you can enter tags:
</p>

<p>
    <img src={scrAutoComplete} alt="Entering tags" class="scr" />
</p>

<p>
    Once you've responded to enough tags, graphs can be generated from your data:
</p>

<p>
    <img src={scrDailyTrend} alt="Daily trend" class="scr-graph" />
    <img src={scrMatrix} alt="Matrix of pings" class="scr-graph" />
</p>

<p>
    <a href="https://www.youtube.com/watch?v=cJpE018QEkQ">Learn more about stochastic time tracking.</a>
</p>

<p>
    {@html config["extra-homepage-text"] || ""}
</p>
