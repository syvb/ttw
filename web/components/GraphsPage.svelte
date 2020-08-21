<script>
    import { Link } from "svelte-routing";
</script>

<h1>Graphs</h1>
<p>
    Here are some graphs, generated from your pings. (They are generated entirely client-side.)
</p>
<ul>
    <li><Link to="/graphs/day-dist">Daily distribution</Link></li>
    <li><Link to="/graphs/pings-scatter">Matrix chart</Link></li>
    <li><Link to="/graphs/trend/daily">Hours per day</Link></li>
</ul>
