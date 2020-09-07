<script>
    import PingSelector from "./PingSelector.svelte";
    import { navigate } from "svelte-routing";
    let settingsName = "Goal name";
    let settingsType = "max";
    let settingsPerInterval = 0.5;
    let settingsInterval = "daily";
    let settingsGenGraph = false;
    function genObj() {
        return {
            id: Math.random().toString(36).split(".")[1],
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
    <button on:click={createGoal}>Create</button>
</div>