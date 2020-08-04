// @ts-ignore
import { xxHash32 } from "./xxhash.ts";

function hslToRgb(h: number, s: number, l: number) {
    var r: number, g: number, b: number;

    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        var hue2rgb = function hue2rgb(p: number, q: number, t: number) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export default function tagColor(tag: string) {
    const hash = xxHash32(tag, 5) / (2 ** 32); // 5 is the seed
    const light = hash < 0.5;
    const frac = (hash - (light ? 0 : 0.5)) / 0.5;
    if (light) {
        return {
            fg: "#ffffff",
            bg: `rgb(${hslToRgb(frac, 1.0, 0.2).join(", ")})`,
        };
    } else {
        return {
            fg: "#000000",
            bg: `rgb(${hslToRgb(frac, 0.74, 0.74).join(", ")})`,
        }
    }
}
