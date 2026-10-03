import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapToneSwitch, mapControlButton, mapControlSurface } from "./map-tone-switch";

describe("MapToneSwitch", () => {
    it("is a radio group of Light and Dark with the tone in force checked and alone in the tab order", () => {
        render(<MapToneSwitch tone="light" onChange={vi.fn()} />);
        const group = screen.getByRole("radiogroup", { name: "Map style" });
        expect(group).toBeInTheDocument();
        const light = screen.getByRole("radio", { name: "Light" });
        const dark = screen.getByRole("radio", { name: "Dark" });
        expect(light).toHaveAttribute("aria-checked", "true");
        expect(dark).toHaveAttribute("aria-checked", "false");
        expect(light).toHaveAttribute("tabindex", "0");
        expect(dark).toHaveAttribute("tabindex", "-1");
    });

    it("picks a tone on click", () => {
        const onChange = vi.fn();
        render(<MapToneSwitch tone="light" onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
        expect(onChange).toHaveBeenCalledWith("dark");
    });

    it("moves to the other tone on an arrow key and takes the focus with it", () => {
        const onChange = vi.fn();
        const view = render(<MapToneSwitch tone="light" onChange={onChange} />);
        fireEvent.keyDown(screen.getByRole("radio", { name: "Light" }), { key: "ArrowRight" });
        expect(onChange).toHaveBeenCalledWith("dark");
        expect(screen.getByRole("radio", { name: "Dark" })).toHaveFocus();

        view.rerender(<MapToneSwitch tone="dark" onChange={onChange} />);
        fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "ArrowLeft" });
        expect(onChange).toHaveBeenLastCalledWith("light");
        /* Other keys are the page's. */
        fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "Enter" });
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("takes the map's tone: a white pill on the light map, dark glass on the dark one", () => {
        const view = render(<MapToneSwitch tone="light" onChange={vi.fn()} />);
        expect(screen.getByRole("radiogroup")).toHaveClass("bg-card/95");
        view.rerender(<MapToneSwitch tone="dark" onChange={vi.fn()} />);
        expect(screen.getByRole("radiogroup")).toHaveClass("bg-neutral-900/90");
    });
});

describe("the controls laid over a map", () => {
    it("follow the map's tone", () => {
        expect(mapControlSurface("light")).toContain("bg-card");
        expect(mapControlSurface("dark")).toContain("bg-neutral-900/85");
        expect(mapControlButton("light")).toBe("hover:bg-muted");
        expect(mapControlButton("dark")).toContain("hover:bg-white/10");
    });
});
