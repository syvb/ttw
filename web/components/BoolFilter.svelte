<script>
    let wrap;
    let err;
    let expr;
    function makeAst(filter) {
        if (expr) expr.free();
        if (filter === "") return null;
        try {
            let ret = window.taglogic.new_expr(filter);
            console.log(ret);
            wrap.classList.remove("invalid");
            err = null;
            return ret;
        } catch (e) {
            wrap.classList.add("invalid");
            err = e;
        }
    }
    $: expr = makeAst(filter);
    export let filter = "";
</script>

<style>
    .filter {
        font-family: monospace;
        padding: 0.4rem;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid black;
        margin-bottom: 0.5rem;
    }
    .filter-wrap {
        display: block;
        box-sizing: border-box;
    }
    .invalid > input {
        background: red;
    }
</style>

<div class="filter-wrap invalid" bind:this={wrap}>
    <input type="text" bind:value={filter} class="filter" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    {#if err}<div class="err">Error: {err || ""}</div>{/if}
</div>
