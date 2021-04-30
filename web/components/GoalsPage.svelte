<script>
    import { navigate } from "svelte-routing";
    import { beeRedir, allBeemGoals } from "../beem.ts";
    let beemGoalsPromise;
    if (localStorage["retag-beem-token"]) {
        beemGoalsPromise = allBeemGoals();
    }
    let goalsPromise = window.db.goals.toArray().then(goals => goals.map(goal => {
        let imgPromise = new Promise(async (resolve, reject) => {
            const beemGoals = await beemGoalsPromise;
            console.log("gp", goal);
            if (goal.beemGoal && beemGoalsPromise) {
                console.log(beemGoals);
                const matchingBeemGoals = beemGoals.filter(beemGoal => beemGoal.slug === goal.beemGoal);
                if (matchingBeemGoals.length === 1) {
                    resolve(matchingBeemGoals[0].thumb_url);
                }
            }
        });
        return { goal, imgPromise };
    }));
    const toGoal = id => () => navigate("/goals/info?id=" + encodeURIComponent(id));
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
        width: 72%;
        height: 95%;
        margin-top: 2.5%;
        margin-left: 2.5%;
        background: #d1d9e6;
        text-align: center;
    }

    .goal-img > img {
        height: 100%;
    }

    #maincontent {
        margin: 8px;
    }
</style>

<main id="maincontent">
    <h1>Goals (beta)</h1>
    <div class="about">
        <p>
            Here you can create and manage your goals. Currently the only point of creating goals is to sync with
            Beeminder. <a href="https://www.youtube.com/watch?v=oZ1R3oxGN90" taget="_blank">Here&rsquo;s a tutorial</a> on setting this up.
        </p>
        <div>
            <button on:click={beeRedir}
                title="This will redirect you to a page where you can make the final call as to if we can access your beeswax.">
                {#if localStorage["retag-beem-token"]}
                    Change connected user
                {:else}
                    Connect to Beeminder
                {/if}
            </button>
            <div>
                {#if localStorage["retag-beem-token"]}
                    Connected with Beeminder!
                {:else}
                    The Beeminder integration isn&rsquo;t active.
                {/if}
            </div>
        </div>
    </div>

    <div class="goal-grid">
        {#await goalsPromise}
            Loading
        {:then goals}
            {#each goals as goal}
                <div on:click={toGoal(goal.goal.id)} class="goal">
                    <div class="goal-img">
                        {#await goal.imgPromise}
                            ...
                        {:then src}
                            <img {src} alt={goal.goal.name} />
                        {/await}
                    </div>
                    <div class="goal-name">{goal.goal.name}</div>
                </div>
            {/each}
        {/await}
        <div on:click={toNew} class="goal new-goal"><span class="new-goal-plus"></span></div>
    </div>
</main>
