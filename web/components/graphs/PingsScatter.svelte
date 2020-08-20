<script>
    import Graph from "./Graph.svelte";
    import { onMount } from "svelte";
    let graphLoadPromise, chart;

    // https://stackoverflow.com/questions/8619879/javascript-calculate-the-day-of-the-year-1-366
    function isLeapYear(date) {
        var year = date.getFullYear();
        if ((year & 3) != 0) return false;
        return ((year % 100) != 0 || (year % 400) == 0);
    }

    function getDOY(date) {
        var dayCount = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        var mn = date.getMonth();
        var dn = date.getDate();
        var dayOfYear = dayCount[mn] + dn;
        if (mn > 1 && isLeapYear(date)) dayOfYear++;
        return dayOfYear;
    }

    function dayNumToDateString(doy) {
        const yearNum = Math.floor(doy / 365);
        const dateObj = new Date(yearNum + 1900, 0);
        dateObj.setDate(doy - (yearNum * 365));
        return dateObj.toLocaleDateString();
    }

    function genData(pings) {
        return pings.map(ping => {
            const dateObj = (new Date(ping.time * 1000));
            const msIntoDay = dateObj.getMilliseconds() + (dateObj.getSeconds() * 60000) + (dateObj.getHours() * 3600000);
            const day = dateObj.getDate();
            const yearsSince1990 = dateObj.getYear();
            const daysIntoYear = getDOY(dateObj);
            // ideally, this would calculate the number of hours since 1990
            // but thanks to leap years, this is sometimes off by a day
            const dayNum = (yearsSince1990 * 365) + daysIntoYear;
            return {
                x: dayNum,
                y: -msIntoDay,
            };
        });
    }

    function msToTimeString(tick) {
        if (tick > 86400000) return "";
        let seconds = tick / 1000;
        let minutes = seconds / 60;
        seconds -= Math.floor(minutes) * 60;
        const hours = minutes / 60;
        minutes -= Math.floor(hours) * 60;
        const dateObj = new Date();
        dateObj.setHours(Math.floor(hours), Math.floor(minutes), Math.floor(seconds));
        return dateObj.toLocaleTimeString();
    }

    function graphLoad(e) {
        const { defaultCanvas } = e.detail;
        const color = Chart.helpers.color;
        chart = new Chart(defaultCanvas, {
            type: "scatter",
            data: {
                // labels: [],
                datasets: [{
                    label: "Pings per hour",
                    borderColor: (window.__theme === "dark") ? "white" : "black",
                    backgroundColor: color((window.__theme === "dark") ? "white" : "black").alpha(0.6).rgbString(),
                    data: [],
                }]
            },
            options: {
                title: {
                    display: true,
                    text: "Daily distribution"
                },
                scales: {
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                            userCallback: tick => msToTimeString(-tick),
                        },
                    }],
                    xAxes: [{
                        ticks: {
                            userCallback: tick => dayNumToDateString(tick),
                        },
                    }],
                },
                tooltips: {
                    callbacks: {
                        label: (tooltipItem, data) => `${dayNumToDateString(parseInt(tooltipItem.label, 10))} ${msToTimeString(-parseInt(tooltipItem.value, 10))}`
                    }
                }
            }
        });
    }

    // onMount(async () => {
    //     await graphLoadPromise;
    // });
    const graphUpdate = e => {
        const { pings } = e.detail;
        const chartData = genData(pings);
        console.log("updating graph", pings, chartData);
        chart.data.datasets[0].data = chartData;
        chart.update();
    };
</script>

<Graph on:graphUpdate={graphUpdate} on:graphLoad={graphLoad} bind:graphLoadPromise loadChartjs>
    <span slot="title">Pings scatter chart</span>
</Graph>
