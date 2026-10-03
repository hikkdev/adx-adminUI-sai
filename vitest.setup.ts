import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

/*
 * Testing Library's own async budget, raised for the same reason
 * `testTimeout` is (see vitest.config.mts).
 *
 * `waitFor` and every `findBy*` default to one second, measured in real time
 * while 180 jsdom environments share the machine. A screen behind a 300 ms
 * debounce has 700 ms of headroom on an idle box and none at all under a
 * full-suite run, so a different debounced screen fails each time — the pin
 * picker one run, the leads board the next. That is load, not a broken test,
 * and the honest fix is to give the assertion room rather than to reach for a
 * fake clock: these tests are about what the user sees settle, and a fake
 * clock would stop testing that.
 *
 * It stays well under `testTimeout`, so a genuinely stuck expectation still
 * fails as itself rather than as a timeout of the whole file.
 */
configure({ asyncUtilTimeout: 5_000 });

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
