<script>
    import { randTip } from "../tips.ts";

    let curTip = randTip();
    const newTip = () => curTip = randTip();
</script>

<style>
    .tip-start {
        font-weight: bold;
    }
</style>

<div>
    <span class="tip-start">Tip!</span>
    {curTip}
    <button on:click={newTip}>Another tip?</button>
</div>
