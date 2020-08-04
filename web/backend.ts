export const FULL_BACKEND = Symbol("FULL_BACKEND");
export const MINI_BACKEND = Symbol("MINI_BACKEND");
let cachedBackend: null | typeof FULL_BACKEND | typeof MINI_BACKEND  = null;
export function backend() {
    if (cachedBackend !== null) return cachedBackend;
    if (typeof localStorage === "undefined") {
        cachedBackend = MINI_BACKEND;
    } else {
        cachedBackend = (localStorage["retag-full"] === "1") ? FULL_BACKEND : MINI_BACKEND;
    }
    return cachedBackend;
}
