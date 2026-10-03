import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { leavesPage, useUnsavedGuard } from "./use-unsaved-guard";

/**
 * LM-1: the layout builder's unsaved-changes guard — which clicks leave the
 * page, and that a dirty editor asks before one does.
 */

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const anchor = (href: string, extra: { target?: string; download?: boolean } = {}) => ({ href, target: extra.target ?? "", hasAttribute: (name: string) => name === "download" && !!extra.download });

describe("leavesPage", () => {
    const here = "http://localhost:5173/content/layouts/WEB_HOME";

    it("stops a plain click to another console page", () => {
        expect(leavesPage(click, anchor("/content/layouts"), here)).toBe(true);
        expect(leavesPage(click, anchor("/content/layouts/WEB_HOME?x=1"), here)).toBe(true);
    });

    it("lets through new tabs, hash jumps, downloads and other sites", () => {
        expect(leavesPage({ ...click, metaKey: true }, anchor("/content"), here)).toBe(false);
        expect(leavesPage(click, anchor("/content", { target: "_blank" }), here)).toBe(false);
        expect(leavesPage(click, anchor("#history"), here)).toBe(false);
        expect(leavesPage(click, anchor("/file.csv", { download: true }), here)).toBe(false);
        expect(leavesPage(click, anchor("https://adx.in/"), here)).toBe(false);
    });
});

function Guarded({ dirty }: { dirty: boolean }) {
    useUnsavedGuard(dirty);
    return (
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- the guard listens for any link; a plain anchor is the case under test
        <a href="/content/layouts" data-testid="away">
            away
        </a>
    );
}

describe("useUnsavedGuard", () => {
    afterEach(() => vi.restoreAllMocks());

    it("asks before a dirty editor is left, and stays when told to", () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        const { getByTestId } = render(<Guarded dirty />);
        const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
        getByTestId("away").dispatchEvent(event);
        expect(confirm).toHaveBeenCalledOnce();
        expect(event.defaultPrevented).toBe(true);
    });

    it("says nothing when there is nothing to lose", () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        const { getByTestId } = render(<Guarded dirty={false} />);
        const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
        getByTestId("away").dispatchEvent(event);
        expect(confirm).not.toHaveBeenCalled();
    });
});
