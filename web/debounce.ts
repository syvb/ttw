export default function debounce(func: (arg0: () => void, arg1: number) => void, wait: number, immediate: boolean) {
    let timeout;
    const context = this;
    let pending = null;
    const fun = function () {
        const args = arguments;
        clearTimeout(timeout);
        pending = function () {
            timeout = null;
            func.apply(context, args);
        };
        timeout = setTimeout(pending, wait);
    };
    fun.end = () => {
        clearTimeout(timeout);
        if (pending) pending();
    };
    return fun;
}
