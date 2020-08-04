<script>
    let expanded = false;
    function expand() { expanded = true; }
    function depand() { expanded = false; }
</script>

<style>
    .main {
        color: rgb(56, 56, 56);
    }
    :global(.dark) .main {
        color: rgb(228, 228, 228);
    }
    :global(.dark) .expanded {
        color: white;
    }
    .expanded {
        color: black;
    }
</style>

<div class="main">
    Seperate tags with spaces.
    <span tabindex="0" class="fake-link" role="button" on:click={expanded ? depand : expand}>{expanded ? "Minimize" : "More info"}</span>
    {#if expanded}
        <div class="expanded">
            You can include any number (including zero) of tags.
            Tags are seperated by spaces.
            Extra whitespace is ignored.
            Duplicate tags are ignored.
            Tags are automatically converted to lowercase.
            If you input a double quote, it will be replaced with the last ping's tags.
            You can use a single double quote to repeat last ping's tags,
            or a double quote followed by more tags to do last ping's tags, and some additional
            ones.
            The order of tags does not matter.
        </div>
    {/if}
</div>
