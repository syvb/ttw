<script>
    import { Link } from "svelte-routing";
    import GoalSettings from "./GoalSettings.svelte";
    export let id; // goal ID, passed from router
    let goalDataPromise = window.db.goals.get(id);

    async function update(e) {
        goalDataPromise = Promise.resolve(e.detail);
    }
</script>

<Link to="/goals">Back to all goals</Link>

{#await goalDataPromise}
    <h1>Loading...</h1>
{:then goal}
    {#if goal}
        <h1>{goal.name}</h1>
        {#if goal.genGraph}
            TODO: graph
        {/if}
        <GoalSettings on:update={update} {goal} />
    {:else}
        Sorry, a goal couldn't be found with that ID.
        Make sure you're logged in to the right account.
    {/if}
{/await}
