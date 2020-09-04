<script>
    import { navigate } from "svelte-routing";
    let goals = [
        { name: "Example goal" },
        { name: "Do less stuff" },
        { name: "Make more goals" },
    ];
    const toGoal = i => () => navigate("/goals/" + i);
    const toNew = () => navigate("/goals/new");
</script>

<style>
    .goal {
        display: inline-block;
        border-radius: 0.5rem;
        width: 300px;
        max-width: 90vw;
        height: 150px;
        max-height: 25vh;
        cursor: pointer;
    }
    .new-goal {
        display: inline-flex;
        border-style: dashed;
        align-items: center;
        justify-content: center;
        border: 3px solid rgb(84, 84, 84);
        background-color: rgb(224, 224, 224);
    }
    .new-goal-plus span {
        font-size: 7rem;
        color: #535353;
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

<h1>Goals</h1>
<div class="about">
    Here you can create and manage your goals.
</div>

<div class="goal-grid">
    {#each goals as goal, i}
        <div on:click={toGoal(i)} class="goal">
            <div style="background: magenta;" class="goal-img"></div>
            {goal.name}
        </div>
    {/each}
    <div on:click={toNew} class="goal new-goal"><span class="new-goal-plus"><span>+</span></span></div>
</div>
