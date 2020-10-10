<script>
    import { onMount } from "svelte";
    import { Link, navigate } from "svelte-routing";
    import GoalSettings from "./GoalSettings.svelte";

    let id = (new URLSearchParams(location.search)).get("id");
    let goalDataPromise = window.db.goals.get(id);

    async function deleteGoal() {
        if (!confirm("Are you sure you want to delete this goal? If you have an associated Beeminder goal, the Beeminder goal won't be deleted.")) return;
        await window.db.goals.delete(id);
        navigate("/goals");
    }
</script>

<style>
    #maincontent {
        margin: 8px;
    }

    .del-container {
        margin-top: 5rem;
    }

    .del {
        color: rgb(95, 11, 11);
    }

    :global(.dark) .del {
        color: rgb(214, 171, 171);
    }
</style>

<main id="maincontent">
    <Link to="/goals">Back to all goals</Link>

    {#await goalDataPromise}
        <h1>Loading...</h1>
    {:then goal}
        {#if goal}
            <h1>{goal.name}</h1>
            <GoalSettings {goal} />
        {:else}
            <div>
                Sorry, a goal couldn't be found with that ID.
                Make sure you're logged in to the right account.
            </div>
        {/if}
    {/await}

    <div class="del-container">
        <button class="del" on:click={deleteGoal}>Delete this goal</button>
    </div>
</main>
