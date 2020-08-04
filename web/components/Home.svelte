<script>
    import LoggedInHome from "./LoggedInHome.svelte";
    import LoggedOutHome from "./LoggedOutHome.svelte";
</script>

{#if window.loginState === "out"}
    <LoggedOutHome />
{:else}
    <LoggedInHome />
{/if}
