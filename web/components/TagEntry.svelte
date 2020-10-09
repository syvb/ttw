<script>
    import { createEventDispatcher, onMount } from "svelte";
    import tagColor from "../tagColor.ts";
    import { searchTagIndex } from "../tagIndex.ts";

    export let small = false;
    export let forceMobile = false;
    export let tags = [];
    export let lastTags = [];
    export const setTags = (newTags, newCur = "") => {
        completedTags = newTags;
        normalizeCompleted();
        tags = completedTags;
        root.tags = tags;
        curInput = newCur;
        suggestions = [];
    };

    let dispatch = createEventDispatcher();
    let completedTags = [];
    let curInput = "";
    let restInputEle;
    let root, tagEntryMain;
    let suggestions = [];
    let activeSuggestion = null;

    onMount(() => {
        completedTags = tags;
        root.setTags = setTags;
        root.focusInner = () => {
            root.children[root.childElementCount - 1].focus();
        };
        root.tags = tags;
        normalizeCompleted();
        tags = completedTags;
    });
    function normalizeCompleted() {
        completedTags = completedTags
            .map(tag => tag.trim().toLowerCase());
        if (completedTags.includes('"')) {
            completedTags = completedTags.concat(lastTags);
        }
        completedTags = [...new Set(completedTags
            .filter(tag => (!tag.match(/^\W*$/)) && (tag !== '"')))];
    }

    function restKeydown(e) {
        if (curInput === "" && e.code === "Enter") {
            dispatch("inputComplete", tags);
        } else if (activeSuggestion !== null && (e.code === "Enter" || e.code === "Space")) {
            chooseSuggestion(activeSuggestion)(e);
        } else if (curInput === "" && e.code === "Backspace") {
            completedTags.pop();
            tags = completedTags;
            root.tags = tags;
            completedTags = completedTags;
            dispatch("input", tags);
        } else if (e.code === "Enter") {
            completedTags.push(curInput.replace(/ /g, ""));
            curInput = "";
            normalizeCompleted();
            tags = completedTags;
            root.tags = tags;
            suggestions = [];
            activeSuggestion = null;
            dispatch("input", tags);
        } else if (e.code === "ArrowDown") {
            e.preventDefault();
            if (activeSuggestion === null && suggestions.length > 0) {
                activeSuggestion = 0;
            } else if (suggestions[activeSuggestion + 1]) {
                activeSuggestion++;
            } else if (suggestions.length > 0) {
                activeSuggestion = 0;
            }
        } else if (e.code === "ArrowUp") {
            e.preventDefault();
            if (activeSuggestion === null && suggestions.length > 0) {
                activeSuggestion = suggestions.length - 1;
            } else if (suggestions[activeSuggestion - 1]) {
                activeSuggestion--;
            } else if (suggestions.length > 0) {
                activeSuggestion = suggestions.length - 1;
            }
        } else if ((e.key === "a" || e.key === "A") && e.ctrlKey) {
            e.preventDefault();
            if (tagEntryMain) {
                if (document.body.createTextRange) {
                    const range = document.body.createTextRange();
                    range.moveToElementText(tagEntryMain);
                    range.select();
                } else if (window.getSelection) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(tagEntryMain);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        }
    }
    let pendingSugFind = 0;
    async function findSuggestions(search) {
        if (small) return [];
        // I used to set suggestions to [] here to stop selecting something that would soon be overwritten
        // but that made things look weird when the suggestions disappeared for a fraction of a second
        activeSuggestion = null;
        pendingSugFind = ++pendingSugFind;
        let thisSugFind = pendingSugFind;
        const newSuggestions = await searchTagIndex(search, 3);
        if (thisSugFind !== pendingSugFind) return;
        suggestions = newSuggestions;
    }
    function restInput(e) {
        if (curInput.includes('"') || curInput.includes("'")) {
            completedTags = completedTags.concat(lastTags);
            curInput = [...curInput].filter(c => c !== '"' && c !== "'").join("");
            normalizeCompleted();
            suggestions = [];
            activeSuggestion = null;
        }
        let spaceIndex = curInput.indexOf(" ");
        while (spaceIndex !== -1) {
            let tag = curInput.slice(0, spaceIndex);
            completedTags.push(tag);
            curInput = curInput.slice(spaceIndex + 1);
            spaceIndex = curInput.indexOf(" ");
        }
        normalizeCompleted();
        if (curInput.trim() === "") {
            tags = completedTags;
            suggestions = [];
            activeSuggestion = null;
        } else {
            tags = completedTags.concat(curInput.trim().toLowerCase());
            if (curInput.length >= 1) {
                findSuggestions(curInput);
            } else {
                suggestions = [];
                activeSuggestion = null;
            }
        }
        root.tags = tags;
        dispatch("input", tags);
    }
    function focusRest() {
        restInputEle.focus();
    }
    function removeTag() {
        const tag = this.textContent.trim();
        completedTags = completedTags.filter(curTag => curTag !== tag);
        if (curInput.trim() === "") {
            tags = completedTags;
        } else {
            tags = completedTags.concat(curInput);
        }
        root.tags = tags;
        dispatch("input", tags);
    }
    const chooseSuggestion = i => e => {
        completedTags.push(suggestions[i]);
        tags = completedTags;
        root.tags = tags;
        curInput = "";
        normalizeCompleted();
        suggestions = [];
        activeSuggestion = null;
        dispatch("input", tags);
    };
</script>

<style>
    .small.tag-entry-root {
        display: inline-block;
    }

    .tag-entry-main {
        border: 1px solid black;
        padding: 0.4rem;
        display: flex;
        cursor: text;
        background-color: white;
    }

    .small .tag-entry-main {
        width: fit-content;
    }

    :global(.dark) .tag-entry-main {
        background-color: rgb(44, 44, 44);
        border: none;
    }

    .rest-tags {
        border: 0;
        height: 100%;
        margin: 0;
        padding: 0;
        flex-grow: 1;
        flex-shrink: 0;
        margin-top: 0.1rem;
        margin-bottom: 0.1rem;
        margin-left: 0.25rem;
        font-size: 1.1rem;
    }

    :global(.dark) .rest-tags {
        color: white;
        background-color: rgb(44, 44, 44);
    }

    .tag {
        /* in em not rem, since a space width is relative to the width of a normal character */
        margin-right: 0.3em;
        background: lightgray;
        padding: 0.1rem;
        padding-left: 0.25rem;
        padding-right: 0.25rem;
        cursor: pointer;
        font-size: 1.1rem;
        border-radius: 0.4rem;
    }

    .ws {
        font-size: 0;
    }

    .autocomplete {
        list-style: none;
        padding: 0;
        margin: 0;
        border-bottom: 1px solid black;
        border-left: 2px solid black;
        border-right: 2px solid black;
    }

    .autocomplete>li {
        background: white;
        border-top: 1px solid black;
        border-bottom: 1px solid black;
        cursor: pointer;
    }

    .autocomplete>li.active,
    .autocomplete>li:hover {
        background: rgb(206, 206, 206);
    }

    :global(.dark) .autocomplete>li {
        background-color: black;
        color: white;
    }

    :global(.dark) .autocomplete>li.active,
    :global(.dark) .autocomplete>li:hover {
        background-color: rgb(77, 77, 77);
        color: white;
    }

    .force-mobile .tag-entry-main {
        display: block;
        box-sizing: border-box;
    }

    .force-mobile .tag {
        display: block;
        margin-bottom: 2px;
    }
</style>

<div class="tag-entry-root" on:click={focusRest} bind:this={root} class:small class:force-mobile={forceMobile}>
    <div class="tag-entry-main" bind:this={tagEntryMain}>
        {#each completedTags as tag}
            <span tabindex="0" class="tag" on:click={removeTag} style="background-color: {tagColor(tag).bg};color: {tagColor(tag).fg};">
                {tag}<span class="ws">{"\t "}</span>
            </span>
        {/each}
        <input type="text" class="rest-tags" bind:value={curInput} bind:this={restInputEle} on:input={restInput} on:keydown={restKeydown}>
    </div>
    {#if suggestions.length > 0}
        <ul class="autocomplete">
            {#each suggestions as sug, i}
                <li on:click={chooseSuggestion(i)} class:active={activeSuggestion === i}>{sug}</li>
            {/each}
        </ul>
    {/if}
</div>
