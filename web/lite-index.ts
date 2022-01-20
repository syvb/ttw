// @ts-ignore
import { STR } from "./strings.ts";
// @ts-ignore
import onSecond from "./onSecond.ts";

if (top !== self) {
    try { top.location.replace(self.location.href); } catch (e) {}
    document.body.innerHTML = `<a href="${location.href}" target="_top">${STR.appName}</a>`
    throw new Error("throwing error to prevent code exec when framed");
}

const taglogicPromise = require("./pkg/taglogic");
