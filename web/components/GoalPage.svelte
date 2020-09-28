<script>
    import { Link } from "svelte-routing";
    import { getGraph } from "../goals.ts";
    import GoalSettings from "./GoalSettings.svelte";
    export let id; // goal ID, passed from router
    let graphPromise = new Promise((resolve, reject) => {}); // never resolves
    let goalDataPromise = window.db.goals.get(id).then(goal => {
        graphPromise = getGraph(goal);
        return goal;
    });
    async function update(e) {
        graphPromise = getGraph(e.detail);
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
            {#await graphPromise}
                <div>Generating graph...</div>
            {:then graph}
                <div>
                    graph: {graph}
                </div>
            {/await}
        {/if}
        <GoalSettings on:update={update} {goal} />
    {:else}
        <div>
            Sorry, a goal couldn't be found with that ID.
            Make sure you're logged in to the right account.
        </div>
    {/if}
{/await}
