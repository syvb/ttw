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
        console.log("r", range);
        picker.selectedDates = range.length === 2 ? range : [now, foreverAgo];
        picker.config.onChange.push((selectedDates, dateStr, instance) => {
            if (selectedDates.length === 2) {
                range = selectedDates;
            }
        });
        picker.changeYear(now.getFullYear());
    });
</script>

<div>
    <div bind:this={pickerEle}></div>
</div>
