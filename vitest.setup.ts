import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * One teardown for every test file.
 *
 * Testing Library mounts into a container it appends to `document.body`, and
 * without this each test leaves its markup behind — so a `getByText` in the
 * fourth test can match a node the first one rendered, and the suite passes for
 * the wrong reason.
 */
afterEach(cleanup);


/**
 * The browser APIs jsdom does not implement.
 *
 * Radix and `cmdk` build every popover against a real layout engine — they
 * measure the trigger to place the panel, and scroll the highlighted row into
 * view as you arrow through it. jsdom has no layout, so these are missing
 * rather than merely inert, and the component throws on mount.
 *
 * These stubs are deliberately inert: they are here so a dropdown can be
 * rendered and searched, not so its positioning can be asserted. Nothing in the
 * suite tests where a panel lands, because in jsdom every panel lands at 0,0.
 */
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

Element.prototype.scrollIntoView ??= function scrollIntoView() {};

/**
 * Radix dismisses on pointer events and asks whether a target can be pointed
 * at. jsdom answers neither question, so a click on an option would close the
 * panel before `onSelect` ran.
 */
Element.prototype.hasPointerCapture ??= function hasPointerCapture() {
    return false;
};
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
