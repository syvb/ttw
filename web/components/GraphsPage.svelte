<script>
    import { Link } from "svelte-routing";
</script>

<style>
    #maincontent {
        margin: 8px;
    }
</style>

<main id="maincontent">
    <h1>Graphs</h1>
    <p>
        Here are some graphs generated from your pings, all by your browser.
        If you have any suggestions for graphs, <a href="mailto:ttw@smitop.com">please tell me!</a>
    </p>
    <ul>
        <li><Link to="/graphs/day-dist">Daily distribution</Link></li>
        <li><Link to="/graphs/pings-scatter">Matrix chart</Link></li>
        <li><Link to="/graphs/trend/daily">Hours per day</Link></li>
        <li><Link to="/graphs/trend/weekly">Hours per week</Link></li>
        <li><Link to="/graphs/trend/monthly">Hours per month</Link></li>
        <li><Link to="/graphs/correlation">Correlations</Link></li>
    </ul>
</main>
