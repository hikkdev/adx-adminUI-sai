import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Combobox } from "./combobox";

/**
 * The searchable dropdown, and the two bugs it was written to fix.
 *
 * The version this replaces filtered on each item's `value` prop, which held the
 * option's id — so typing a name searched a list of cuids and matched nothing.
 * It also read the selection back from `cmdk`'s `onSelect`, which lowercases
 * what it hands over, so a selected cuid came back mangled.
 *
 * Both were silent: the control rendered, opened, and looked entirely correct.
 * These tests are here because nothing else would have noticed.
 *
 * Driven with `fireEvent` rather than `user-event`, which will not install
 * against this project's `@types/node` without dragging the whole toolchain
 * forward. Everything under test here reacts to change and click events, so the
 * extra fidelity would buy nothing.
 */

/** Opens the list and types into it. */
function open() {
    fireEvent.click(screen.getByRole("combobox"));
}

function search(text: string) {
    fireEvent.change(screen.getByPlaceholderText("Type to search…"), { target: { value: text } });
}

/**
 * Picks an option from the open list.
 *
 * Scoped to the listbox because the chosen option's label also sits on the
 * trigger, so an unscoped query matches twice as soon as anything is selected.
 */
function choose(label: string) {
    fireEvent.click(within(screen.getByRole("listbox")).getByText(label));
}

const CATALOGUE = [
    { label: "Atrium LED Walls", value: "cmZaBcDeF01", group: "Digital Displays" },
    { label: "Escalator Handrail Stickers", value: "cmZaBcDeF02", group: "Static Formats" },
    { label: "Floor Graphics", value: "cmZaBcDeF03", group: "Static Formats" },
];

describe("searching", () => {
    it("finds an option by its label, not its id", () => {
        render(<Combobox items={CATALOGUE} value="" onValueChange={vi.fn()} />);

        open();
        search("atrium");

        expect(screen.getByText("Atrium LED Walls")).toBeInTheDocument();
        expect(screen.queryByText("Floor Graphics")).not.toBeInTheDocument();
    });

    it("searches the description too, so a catalogue group finds its formats", () => {
        render(
            <Combobox
                items={[{ label: "Floor Graphics", value: "x1", description: "Static Formats" }]}
                value=""
                onValueChange={vi.fn()}
            />
        );

        open();
        search("static");

        expect(screen.getByText("Floor Graphics")).toBeInTheDocument();
    });

    it("says so when nothing matches rather than showing an empty box", () => {
        render(<Combobox items={CATALOGUE} value="" onValueChange={vi.fn()} />);

        open();
        search("zzzz");

        expect(screen.getByText("No matches.")).toBeInTheDocument();
    });
});

describe("choosing", () => {
    /**
     * The id has to survive intact. `cmdk` lowercases the value it passes to
     * `onSelect`, so reading it from there returns a cuid that matches no row.
     */
    it("returns the id exactly as given, case included", () => {
        const onValueChange = vi.fn();
        render(<Combobox items={CATALOGUE} value="" onValueChange={onValueChange} />);

        open();
        choose("Atrium LED Walls");

        expect(onValueChange).toHaveBeenCalledWith("cmZaBcDeF01");
    });

    it("shows the chosen option's label on the trigger", () => {
        render(<Combobox items={CATALOGUE} value="cmZaBcDeF02" onValueChange={vi.fn()} />);
        expect(screen.getByRole("combobox")).toHaveTextContent("Escalator Handrail Stickers");
    });

    it("clears when the chosen option is picked again", () => {
        const onValueChange = vi.fn();
        render(
            <Combobox items={CATALOGUE} value="cmZaBcDeF01" onValueChange={onValueChange} />
        );

        open();
        choose("Atrium LED Walls");

        expect(onValueChange).toHaveBeenCalledWith("");
    });
});

describe("a list too long to render", () => {
    const many = Array.from({ length: 400 }, (_, index) => ({
        label: `Spot type ${index}`,
        value: `id-${index}`,
    }));

    /**
     * Thirteen hundred rows makes opening the list visibly slow. The cap is
     * applied *after* filtering, so typing still reaches anything — and the
     * number hidden is shown, because a list that silently stops looks like a
     * list that does not contain what you are searching for.
     */
    it("caps what it renders and says how much is hidden", () => {
        render(<Combobox items={many} value="" onValueChange={vi.fn()} />);

        open();

        expect(screen.getByText(/300 more match/)).toBeInTheDocument();
        expect(screen.queryByText("Spot type 399")).not.toBeInTheDocument();
    });

    it("still reaches an option past the cap once you type", () => {
        render(<Combobox items={many} value="" onValueChange={vi.fn()} />);

        open();
        search("type 399");

        expect(screen.getByText("Spot type 399")).toBeInTheDocument();
    });
});
