<script>
    import { onMount } from "svelte";
    import { Link } from "svelte-routing";
    import { getGraph } from "../goals.ts";
    import GoalSettings from "./GoalSettings.svelte";

    let id = (new URLSearchParams(location.search)).get("id");
    let goalDataPromise = window.db.goals.get(id);
</script>

<style>
    #maincontent {
        margin: 8px;
    }
</style>

<main id="maincontent">
    <Link to="/goals">Back to all goals</Link>

    {#await goalDataPromise}
        <h1>Loading...</h1>
    {:then goal}
        {#if goal}
            <h1>{goal.name}</h1>
            TODO
        {:else}
            <div>
                Sorry, a goal couldn't be found with that ID.
                Make sure you're logged in to the right account.
            </div>
        {/if}
    {/await}
</main>
