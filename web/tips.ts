// @ts-ignore
import { STR } from "./strings.ts";

export function randTip() {
    return STR.tips[Math.floor(Math.random() * STR.tips.length)];
}
