<script>
    export let id; // goal ID, passed from router
    let goalDataPromise = window.db.goals.get(id);
</script>

{#await goalDataPromise}
    <h1>Loading...</h1>
{:then goal}
    {#if goal}
        <h1>{goal.name}</h1>
        {#if goal.genGraph}
            TODO: graph
        {/if}
    {:else}
        Sorry, a goal couldn't be found with that ID.
        Make sure you're logged in to the right account.
    {/if}
{/await}
