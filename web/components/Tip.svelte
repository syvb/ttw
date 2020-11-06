<script>
    import { randTip } from "../tips.ts";

    let curTip = randTip();
    const newTip = () => curTip = randTip();
</script>

<style>
    .tip-start {
        font-weight: bold;
    }
    .tip-root {
        cursor: pointer;
    }
</style>

<div class="tip-root" on:click={newTip}>
    <span class="tip-start">Tip!</span>
    {curTip}
</div>
