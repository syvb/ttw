interface CallbackInfo {
    time: number,
    cb: Function,
}

let callbacks: CallbackInfo[] = [];

function checkCallbacks() {
    let now = Date.now();
    callbacks.forEach(({ time, cb }, i) => {
        if (now >= time) {
            cb();
            callbacks[i] = null;
        }
    });
    callbacks = callbacks.filter(cb => cb !== null);
}

setInterval(checkCallbacks, 1500);

export default function onSecond(time: number, cb: () => void) {
    callbacks.push({
        time,
        cb,
    });
    let timeUntilCallback = Math.ceil(time - Date.now());
    console.log(timeUntilCallback)
    setTimeout(checkCallbacks, timeUntilCallback);
    checkCallbacks();
}
