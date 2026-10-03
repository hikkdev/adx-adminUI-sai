/**
 * The pixel size of an image file, read in the browser before upload, so the
 * backend's dimensions check has something to check. Null for anything that
 * is not an image, and null on the server, where there is no `Image`.
 *
 * Lifted out of the campaign page's Creatives card (CR-1) so the Deliver
 * dialog on the design-requests tab reads the same numbers the same way.
 */
export function imageSize(file: File): Promise<{ width: number; height: number } | null> {
    if (!file.type.startsWith("image/") || typeof window === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const image = new window.Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        image.src = url;
    });
}
