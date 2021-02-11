// Eventually this might be a full i18n implementation, but for now this is just used for access
// to some important strings

const config = require("../config.json");

export let STR = {} as any;

// notranslate: appName
STR.appName = config["app-name"] || "TagTime Web";

STR.tips = `Keep your tags short and simple.
Tags are converted to lowercase.
Each tag has a unique color.
You can export and import from the original TagTime.
When entering tags, you can enter a double or single quote to repeat last ping's tags.
You can set a sound to play when it's ping time in Settings.
You can switch between dark mode and light mode in Settings.
You can switch to the original TagTime algorithm in Settings.
You can use filtering options in the Pings/Goals/Graphs tab to only include pings without a certain tag.
You can use filtering options in the Pings/Goals/Graphs tab to include pings that have all of a list of tags.
You can change the default AFK tags in settings.
Tags are converted to lowercase.
On most recent browsers, you can use ${STR.appName} offline.
${STR.appname} will automatically sync up when you are reconnected to the Internet if you answer pings offline.
You can export your tags as a SQLite database in Settings, and run SQL queries against it.
You can enable notifications from Settings to get a push notification when it's ping time.
When entering tags, you can click on a tag to remove it.
You can connect ${STR.appName} to Beeminder in the Goals tab.
You can see what hours of the day get the most of a particular tag with the Daily distribution graph.
${STR.appName} is open source! You can find in on GitHub as smittyvb/ttw
You can easily see all pings over a 30 day time range in the Pings and Graphs tab.`.split("\n");

STR.welcome = `Welcome to ${STR.appName}!`;

STR.reloadNote = `Note: To prevent incorrect ping timing, reload all open ${STR.appName} tabs after changing this setting (while connected to the Internet).`;
