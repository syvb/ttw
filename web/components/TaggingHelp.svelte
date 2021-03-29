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
            <ul>
                <li>You can include any number (including zero) of tags.</li>
                <li>Seperate tags with spaces.</li>
                <li>Duplicate tags are ignored.</li>
                <li>Tags are case-insensitive</li>
                <li>Use a single/double quote to repeat last ping's tags.</li>
                <li>Tags can be in any order</li>
            </ul>
        </div>
    {/if}
</div>
