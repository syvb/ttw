<script>
    import { navigate } from "svelte-routing";
    import { createEventDispatcher } from "svelte";
    import PingSelector from "./PingSelector.svelte";
    let dispatch = createEventDispatcher();
    export let goal = null;
    let settingsName = goal?.name ?? "Goal name";
    let settingsType = goal?.type ?? "max";
    let settingsPerInterval = goal?.perInterval ?? 0.5;
    let settingsInterval = goal?.interval ?? "daily";
    let settingsGenGraph = goal?.genGraph ?? true;
    function genObj() {
        return {
            id: (goal === null) ? Math.random().toString(36).split(".")[1] : goal.id,
            name: settingsName,
            type: settingsType,
            perInterval: settingsPerInterval,
            interval: settingsInterval,
            genGraph: settingsGenGraph ? 1 : 0,
            beemGoal: "todo",
        };
    }
    function createGoal() {
        let settings = genObj();
        db.goals.add(settings);
        navigate("/goals");
    }
    async function updateGoal() {
        let settings = genObj();
        db.goals.update(settings.id, settings);
        dispatch("update", settings);
    }
</script>

<div>
    <div>
        Name: <input type="text" bind:value={settingsName}>
    </div>
    <div>
        <div>
            <label>
                <input type="checkbox" bind:checked={settingsGenGraph}>
                Generate graph
            </label>
        </div>
        {#if settingsGenGraph}
            <div>
                    <select bind:value={settingsInterval}>
                        <option name="daily">Daily</option>
                        <option name="weekly">Weekly</option>
                        <option name="monthly">Monthly</option>
                        <option name="yearly">Yearly</option>
                    </select>
                    <select bind:value={settingsType}>
                        <option name="max">maximum</option>
                        <option name="min">minimum</option>
                    </select>: <input type="number" bind:value={settingsPerInterval}>
            </div>
            <div>
                <PingSelector open />
            </div>
        {/if}
    </div>
    {#if goal == null}
        <!-- new goal -->
        <button on:click={createGoal}>Create</button>
    {:else}
        <!-- existing goal -->
        <button on:click={updateGoal}>Update</button>
    {/if}
</div>
