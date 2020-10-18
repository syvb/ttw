<script>
    import { navigate } from "svelte-routing";
    import { createEventDispatcher } from "svelte";
    import PingSelector from "./PingSelector.svelte";
    import { prepGoal } from "../beem.ts";
    import { goalsChanged } from "../goals.ts";
    import { beemResync } from "../beem.ts";
    let dispatch = createEventDispatcher();
    export let goal = null;
    let settingsName, settingsType, settingsIncludedTags, settingsExcludedTags, settingsIncludeType, settingsBeem;
    if (goal) {
        settingsName = goal.name || "Goal name";
        settingsType = goal.type || "max";
        settingsIncludedTags = goal.includedTags || [];
        settingsExcludedTags = goal.excludedTags || [];
        settingsIncludeType = goal.includeType || "some";
        settingsBeem = goal.beemGoal || "";
    }
    let origGoalBeem = settingsBeem;
    function genObj() {
        return {
            id: (goal === null) ? Math.random().toString(36).split(".")[1] : goal.id,
            name: settingsName,
            type: settingsType,
            beemGoal: "todo",
            includedTags: settingsIncludedTags,
            excludedTags: settingsExcludedTags,
            includeType: settingsIncludeType,
            beemGoal: settingsBeem,
        };
    }
    async function createGoal() {
        let settings = genObj();
        db.goals.add(settings);
        const goalsChangedPromise = goalsChanged();
        if (settingsBeem) {
            await Promise.all([
                prepGoal(settingsBeem),
                goalsChangedPromise.then(() => beemResync()),
            ]);
        }
        origGoalBeem = settingsBeem;
        navigate("/goals");
    }
    async function updateGoal() {
        let settings = genObj();
        db.goals.update(settings.id, settings);
        const goalsChangedPromise = goalsChanged();
        dispatch("update", settings);
        if (settingsBeem && (settingsBeem !== origGoalBeem)) {
            await Promise.all([
                prepGoal(settingsBeem),
                goalsChangedPromise.then(() => beemResync()),
            ]);
        }
        origGoalBeem = settingsBeem;
    }
</script>

<main id="maincontent">
    <div>
        <label for="goal-settings-name">Name: </label>
        <input type="text" id="goal-settings-name" bind:value={settingsName}>
    </div>
    <div>
        <PingSelector open norange justcrit bind:includedTags={settingsIncludedTags} bind:excludedTags={settingsExcludedTags} bind:includeType={settingsIncludeType} />
    </div>
    <div>
        <label for="goal-settings-beem">Beeminder goal name:</label>
        <input type="text" id="goal-settings-beem" bind:value={settingsBeem}>
    </div>
    {#if goal == null}
        <!-- new goal -->
        <button on:click={createGoal}>Create goal</button>
    {:else}
        <!-- existing goal -->
        <button on:click={updateGoal}>Update goal</button>
    {/if}
</main>
