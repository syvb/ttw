<script>
    export let lastPingTags = [];
    export let insertTags = () => {};
    function insertLast() {
        insertTags(lastPingTags);
    }
    const insertTagsN = tags => e => insertTags(tags);
</script>

<style>
    .last-tags {
        font-weight: bold;
        cursor: pointer;
    }
</style>

{#if lastPingTags}
    <div>
        Last ping: <span class="last-tags" on:click={insertLast}>{lastPingTags.join(" ")}</span>
        {#await (window.db.pings.orderBy("time").reverse().limit(3)).toArray()}
            <!-- display nothing while loading pings -->
        {:then last3}
            {#each last3 as prev, i}
                {#if i !== 0}
                    last - {i}: <span class="last-tags" on:click={insertTagsN(prev.tags)}>{prev.tags.join(" ")}</span>&nbsp;
                {/if}
            {/each}
        {/await}
    </div>
{/if}
