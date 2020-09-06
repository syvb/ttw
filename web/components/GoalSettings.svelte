<script>
    import PingSelector from "./PingSelector.svelte";
    let settingsName = "Goal name";
    let settingsType = "max";
    let settingsPerInterval = 0.5;
    let settingsInterval = "daily";
    let settingsGenGraph = false;
    export let settings;
    $: {
        settings = {
            name: settingsName,
            type: settingsType,
            perInterval: settingsPerInterval,
            interval: settingsInterval,
            genGraph: settingsGenGraph,
        };
    }
</script>

<div>
    <div>
        Name: <input type="text" bind:value={settingsName}>
    </div>
    <div>
        <div>
            {settingsGenGraph}
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
    <button>Create</button>
</div>