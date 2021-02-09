window.addEventListener("DOMContentLoaded", function() {
    for (let i = 0; i < document.forms.length; i++) {
        const form = document.forms[i];
        form.addEventListener("submit", function() {
            document.querySelector("input[type=submit]").disabled = true;
        });
    }
});
