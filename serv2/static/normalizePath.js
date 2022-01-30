const APP_PATHS = [
    "settings",
    "cntpings",
    "welcome",
    "graphs",
    "graphs/day-dist",
    "graphs/pings-scatter",
    "graphs/trend/daily",
    "graphs/trend/weekly",
    "graphs/trend/monthly",
    "graphs",
    "goals",
    "goals/info",
    "goals/new",
];

module.exports = function normalizePath(path) {
    if (path.startsWith(".")) path = path.slice(1);
    if (path.startsWith("/")) path = path.slice(1);
    if (path.endsWith("index.html")) path = path.slice(0, -10);
    if (path.endsWith("/")) path = path.slice(0, -1);
    if (path.endsWith(".html")) path = path.slice(0, -5);
    if (APP_PATHS.includes(path)) path = "app"
    return path;
}
