"use client";

import * as React from "react";

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave without saving them?";

/**
 * Whether a click should be stopped to ask first: a plain left click on a
 * link to another page of this console. New tabs, downloads, hash jumps and
 * other sites are left alone — none of them unloads the editor.
 */
export function leavesPage(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">, anchor: { href: string; target: string; hasAttribute: (name: string) => boolean }, here: string): boolean {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    if (anchor.hasAttribute("download")) return false;
    let next: URL;
    let current: URL;
    try {
        next = new URL(anchor.href, here);
        current = new URL(here);
    } catch {
        return false;
    }
    if (next.origin !== current.origin) return false;
    return next.pathname !== current.pathname || next.search !== current.search;
}

/**
 * Asks before an editor with unsaved changes is left: the browser's own
 * prompt on reload and close, and a confirm on any in-app link (the App
 * Router has no navigation event to hook, so links are caught on the way
 * down, before Next.js sees the click).
 */
export function useUnsavedGuard(dirty: boolean, message = UNSAVED_MESSAGE): void {
    React.useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = message;
            return message;
        };
        const onClick = (event: MouseEvent) => {
            const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!anchor || !leavesPage(event, anchor, window.location.href)) return;
            if (!window.confirm(message)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        document.addEventListener("click", onClick, true);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
            document.removeEventListener("click", onClick, true);
        };
    }, [dirty, message]);
}
