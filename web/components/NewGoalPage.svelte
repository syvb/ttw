<script>
    import { Link } from "svelte-routing";
    import GoalSettings from "./GoalSettings.svelte";
</script>

<style>
    #maincontent {
        margin: 8px;
    }
</style>

<main id="maincontent">
    <Link to="/goals">Back to all goals</Link>

    <h1>New goal</h1>
    <p>
        Create a new goal:
    </p>

    <GoalSettings />
</main>
