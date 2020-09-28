<script>
    import { navigate } from "svelte-routing";
    let goalsPromise = window.db.goals.toArray();
    const toGoal = id => () => navigate("/goals/" + id);
    const toNew = () => navigate("/goals/new");
</script>

<style>
    .goal {
        display: inline-block;
        border-radius: 0.5rem;
        width: 300px;
        height: 150px;
        cursor: pointer;
        vertical-align: middle;
        margin-bottom: 1.2em;
    }
    .new-goal {
        display: inline-flex;
        border-style: dashed;
        align-items: center;
        justify-content: center;
        border: 3px solid rgb(84, 84, 84);
        background-color: rgb(224, 224, 224);
        width: 5rem;
        height: 5rem;
    }
    .new-goal-plus:before {
        content: "+";
        font-size: 7rem;
        color: #535353;
    }
    .goal-name {
       margin-left: 2.5%;
       font-size: 120%;
    }
    .about {
        margin-bottom: 1rem;
    }
    .goal-grid {
        box-sizing: border-box;
    }
    .goal-img {
        width: 95%;
        height: 95%;
        margin-top: 2.5%;
        margin-left: 2.5%;
    }
</style>

<h1>Goals (beta)</h1>
<div class="about">
    Here you can create and manage your goals.
</div>

<div class="goal-grid">
    {#await goalsPromise}
        Loading
    {:then goals}
        {#each goals as goal}
            <div on:click={toGoal(goal.id)} class="goal">
                <div style="background: magenta;" class="goal-img"></div>
                <div class="goal-name">{goal.name}</div>
            </div>
        {/each}
    {/await}
    <div on:click={toNew} class="goal new-goal"><span class="new-goal-plus"></span></div>
</div>
