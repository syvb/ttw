// @license magnet:?xt=urn:btih:8e4f440f4c65981c5bf93c76d35135ba5064d8b7&dn=apache-2.0.txt Apache-2.0
window.addEventListener("DOMContentLoaded", function() {
    for (let i = 0; i < document.forms.length; i++) {
        const form = document.forms[i];
        form.addEventListener("submit", function() {
            document.querySelector("input[type=submit]").disabled = true;
        });
    }
});
// @license-end
