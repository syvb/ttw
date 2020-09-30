<script>
    import { onMount } from "svelte";
    import { Link } from "svelte-routing";
    import { getGraph } from "../goals.ts";
    import GoalSettings from "./GoalSettings.svelte";

    const bgraphPromise = import("../../road/src/bgraph.js");
    let graphContainer;
    let id = (new URLSearchParams(location.search)).get("id");
    let goalDataPromise = window.db.goals.get(id);
    const mountPromise = new Promise((resolve, reject) => onMount(resolve));
    function updateGraph(goalData, bgraph) {
        getGraph(goalData, graphContainer, bgraph.default);
    }
    Promise.all([ goalDataPromise, bgraphPromise, mountPromise ]).then(([ goalData, bgraph ]) => {
        updateGraph(goalData, bgraph);
    });
    async function update(e) {
        goalDataPromise = Promise.resolve(e.detail);
        updateGraph(e.detail, await bgraphPromise);
    }
</script>

<Link to="/goals">Back to all goals</Link>

{#await goalDataPromise}
    <h1>Loading...</h1>
{:then goal}
    {#if goal}
        <h1>{goal.name}</h1>
        {#if goal.genGraph}
            <div bind:this={graphContainer}></div>
        {/if}
        <GoalSettings on:update={update} {goal} />
    {:else}
        <div>
            Sorry, a goal couldn't be found with that ID.
            Make sure you're logged in to the right account.
        </div>
    {/if}
{/await}
