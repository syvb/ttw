<script>
    import LoggedInHome from "./LoggedInHome.svelte";
    import LoggedOutHome from "./LoggedOutHome.svelte";
</script>

<style>
    .home {
        padding: 8px;
    }
</style>

<div class="home">
    {#if window.loginState === "out"}
        <LoggedOutHome />
    {:else}
        <LoggedInHome />
    {/if}
</div>
