/**
 * The reference an error overlay prints — Q-C item 10.
 *
 * `ERR-` and eight hex digits of a hash over the error's message and stack:
 * stable for one crash (the same throw on the same build hashes the same,
 * so a screenshot and a report match), different across crashes (two
 * different throws do not share a reference). The overlay logs the error
 * under the same reference, so a report quoting it finds the console line
 * that carries the stack.
 *
 * FNV-1a over UTF-16 code units — small, dependency-free and deterministic;
 * this is a label for matching, not a fingerprint that has to resist
 * collision.
 */
export function errorReference(error: { message?: string; stack?: string; digest?: string }): string {
    const text = `${error.message ?? ""}\n${error.stack ?? ""}\n${error.digest ?? ""}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `ERR-${hash.toString(16).toUpperCase().padStart(8, "0")}`;
}
