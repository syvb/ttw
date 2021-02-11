// wrapper around requestIdleCallback

export let whenIdle;
if ((self as any).requestIdleCallback) {
    whenIdle = (cb, timeout) => (self as any).requestIdleCallback(cb, { timeout });
} else {
    whenIdle = (cb, timeout) => self.setTimeout(cb, timeout);
}
