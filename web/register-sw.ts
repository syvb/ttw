// @ts-ignore
import { pushLoadCheck } from "./push.ts";

const SW_CHECK_INTERVAL = 43200000; // 12 hours

export async function registerSw() {
    if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const swCheck = async () => {
            await reg.update();
            setTimeout(swCheck, SW_CHECK_INTERVAL);
        };
        setTimeout(swCheck, SW_CHECK_INTERVAL);
        pushLoadCheck();
    }
}
