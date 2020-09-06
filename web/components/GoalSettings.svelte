<script>
    import PingSelector from "./PingSelector.svelte";
    let settingsName = "Goal name";
    let settingsType = "max";
    let settingsPerInterval = 0.5;
    let settingsInterval = "daily";
    export let settings;
    $: {
        settings = {
            name: settingsName,
            type: settingsType,
            perInterval: settingsPerInterval,
            interval: settingsInterval,
        };
        console.log(settings)
    }
</script>

<div>
    <div>
        Name: <input type="text" bind:value={settingsName}>
    </div>
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
    <PingSelector open />
    <button>Create</button>
</div>