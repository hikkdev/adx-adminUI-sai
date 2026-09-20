/**
 * QR-12 — the pixel size of an image the console is about to upload, so a
 * slot can refuse a file that is not the size the surface needs before it
 * goes anywhere. An SVG has no pixel size and answers null; so does a file
 * the browser cannot decode within a moment (the slot then uploads it
 * unchecked rather than blocking on a decoder that will not answer).
 */
export interface ImageSize {
    width: number;
    height: number;
}

export function readImageSize(file: File, timeoutMs = 2000): Promise<ImageSize | null> {
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) return Promise.resolve(null);
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof Image === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        let done = false;
        const finish = (size: ImageSize | null) => {
            if (done) return;
            done = true;
            URL.revokeObjectURL(url);
            resolve(size);
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        img.onload = () => {
            clearTimeout(timer);
            finish(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
        };
        img.onerror = () => {
            clearTimeout(timer);
            finish(null);
        };
        img.src = url;
    });
}

/** What a slot requires of a raster file. `exact` is width × height; `min` is at least; `square` is 1 : 1 and at least `min` on a side. */
export type SizeRule =
    | { kind: "exact"; width: number; height: number }
    | { kind: "min"; width: number; height?: number }
    | { kind: "square"; min: number };

/** The problem with a size against a rule, in a sentence, or null when it passes. */
export function sizeProblem(size: ImageSize, rule: SizeRule): string | null {
    if (rule.kind === "exact") {
        return size.width === rule.width && size.height === rule.height ? null : `It is ${size.width} × ${size.height}; this slot needs exactly ${rule.width} × ${rule.height}.`;
    }
    if (rule.kind === "square") {
        if (size.width !== size.height) return `It is ${size.width} × ${size.height}; this slot needs a square.`;
        return size.width >= rule.min ? null : `It is ${size.width} × ${size.height}; this slot needs at least ${rule.min} × ${rule.min}.`;
    }
    const tallEnough = rule.height === undefined || size.height >= rule.height;
    return size.width >= rule.width && tallEnough
        ? null
        : `It is ${size.width} × ${size.height}; this slot needs at least ${rule.width}${rule.height !== undefined ? ` × ${rule.height}` : " wide"}.`;
}

/** A rule as the slot's instruction line reads it. */
export function sizeRuleText(rule: SizeRule): string {
    if (rule.kind === "exact") return `exactly ${rule.width} × ${rule.height} px`;
    if (rule.kind === "square") return `square, at least ${rule.min} × ${rule.min} px`;
    return rule.height !== undefined ? `at least ${rule.width} × ${rule.height} px` : `at least ${rule.width} px wide`;
}
