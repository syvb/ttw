export let tips = `Keep your tags short and simple.
Tags are converted to lowercase.
Each tag has a unique color.
You can export and import from the original TagTime.
When entering tags, you can enter " (a double quote) to repeat last ping's tags.
You can set a sound to play when it's ping time in Settings.
You can switch to dark mode in Settings.
You can switch between dark mode and light mode in Settings.
You can change the default AFK tags in settings.
Tags are converted to lowercase.`.split("\n");

export function randTip() {
    return tips[Math.floor(Math.random() * tips.length)];
}
