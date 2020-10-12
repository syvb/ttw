<script>
    import { navigate } from "svelte-routing";
    import { createEventDispatcher } from "svelte";
    import PingSelector from "./PingSelector.svelte";
    import { prepGoal } from "../beem.ts";
    import { goalsChanged } from "../goals.ts";
    import { beemResync } from "../beem.ts";
    let dispatch = createEventDispatcher();
    export let goal = null;
    let settingsName = (goal?.name) ?? "Goal name";
    let settingsType = (goal?.type) ?? "max";
    let settingsIncludedTags = (goal?.includedTags) ?? [];
    let settingsExcludedTags = (goal?.excludedTags) ?? [];
    let settingsIncludeType = (goal?.includeType) ?? "some";
    let settingsBeem = (goal?.beemGoal) ?? "";
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
        goalsChanged();
        if (settingsBeem) {
            await Promise.all([
                prepGoal(settingsBeem),
                beemResync(),
            ]);
        }
        origGoalBeem = settingsBeem;
        navigate("/goals");
    }
    async function updateGoal() {
        let settings = genObj();
        db.goals.update(settings.id, settings);
        goalsChanged();
        dispatch("update", settings);
        if (settingsBeem && (settingsBeem !== origGoalBeem)) {
            await Promise.all([
                prepGoal(settingsBeem),
                beemResync(),
            ]);
        }
        origGoalBeem = settingsBeem;
    }
</script>

<div>
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
</div>
