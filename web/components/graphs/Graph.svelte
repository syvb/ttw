<script>
    import { Link } from "svelte-routing";
    export let pings = {};
</script>

<!-- Generic graph component -->
<h1><slot name="title"></slot></h1>
<div>
    Back to <Link to="/graphs">all graphs</Link>
</div>

<div>
    Select pings: TODO
</div>

<div>
    <slot name="graph"></slot>
</div>
