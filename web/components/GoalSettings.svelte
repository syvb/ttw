<script>
    import PingSelector from "./PingSelector.svelte";
    let settingsName = "Goal name";
    let settingsType = "max";
    let settingsPerDay = 0.5;
    export let settings;
    $: {
        settings = {
            name: settingsName,
            type: settingsType,
            perDay: settingsPerDay,
        };
        console.log(settings);
    }
</script>

<div>
    <div>
        Name: <input type="text" bind:value={settingsName}>
    </div>
    <div>
        Daily <select bind:value={settingsType}>
            <option name="max">maximum</option>
            <option name="min">minimum</option>
        </select>: <input type="number" bind:value={settingsPerDay}>
    </div>
    <PingSelector open />
    <button>Create</button>
</div>