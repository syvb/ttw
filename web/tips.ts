export let tips = `Keep your tags short and simple.
Tags are converted to lowercase.
Each tag has a unique color.
You can export and import from the original TagTime.
When entering tags, you can enter a double or single quote to repeat last ping's tags.
You can set a sound to play when it's ping time in Settings.
You can switch to dark mode in Settings.
You can switch between dark mode and light mode in Settings.
You can change the default AFK tags in settings.
Tags are converted to lowercase.
On most recent browsers, you can use TagTime Web offline.
You can export your tags as a SQLite database in Settings.
You can enable notifications from Settings to get a push notification when it's ping time.
When entering tags, you can click on a tag to remove it.
You can connect TagTime Web to Beeminder in the Goals tab.
You can see what hours of the day get the most of a particular tag with the Daily distribution graph.
TagTime Web is open source! You can find in on GitHub as smittyvb/ttw`.split("\n");

export function randTip() {
    return tips[Math.floor(Math.random() * tips.length)];
}
