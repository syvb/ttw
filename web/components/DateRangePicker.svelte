<script>
    import { onMount } from "svelte";

    const flatpickrPromise = import("flatpickr");
    const now = new Date();
    const foreverAgo = new Date();
    foreverAgo.setFullYear(foreverAgo.getFullYear() - 1);
    export let range = [];
    let pickerEle;
    onMount(async () => {
        const flatpickr = (await flatpickrPromise).default;
        const picker = flatpickr(pickerEle, {
            mode: "range",
            appendTo: pickerEle,
            time_24hr: true,
            allowInput: true,
            enableTime: true,
            inline: true,
            defaultDate: [now, foreverAgo],
        });
        picker.selectedDates = range.length === 2 ? range : [now, foreverAgo];
        picker.config.onChange.push((selectedDates, dateStr, instance) => {
            if (selectedDates.length === 2) {
                range = selectedDates;
            }
        });
        picker.changeYear(now.getFullYear());
    });
    function rangeSelect(rangeType, qual) {
        // TODO...
    }
</script>

<style>
    .sugg {
        display: inline-block;
        border-radius: 21px;
        background: #005644;
        cursor: pointer;

        padding-top: 2px;
        padding-bottom: 2px;
        padding-left: 6px;
        padding-right: 6px;

        margin-bottom: 0.5rem;
    }
    .suggs {
        width: 307.875px; /* flatpickr calendar width */
    }
</style>

<div>
    <div class="suggs">
        <span class="sugg" on:click={rangeSelect("calRel", "today")}>Today</span>
        <span class="sugg" on:click={rangeSelect("calRel", "week")}>This week</span>
        <span class="sugg" on:click={rangeSelect("calRel", "month")}>This month</span>
        <span class="sugg" on:click={rangeSelect("calRel", "year")}>This year</span>
        <span class="sugg" on:click={rangeSelect("rel", 30)}>Last 30 days</span>
        <span class="sugg" on:click={rangeSelect("rel", 90)}>Last 90 days</span>
        <span class="sugg" on:click={rangeSelect("rel", 365)}>Last 365 days</span>
    </div>
    <div bind:this={pickerEle}></div>
</div>
