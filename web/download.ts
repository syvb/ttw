export default function download(data: string, mime: string, fileName: string) {
    const blob = new Blob([data], { type: mime });
    const a = document.createElement("a");
    a.download = fileName;
    a.href = URL.createObjectURL(blob);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // setTimeout(function() { URL.revokeObjectURL(a.href); }, 1500);
}