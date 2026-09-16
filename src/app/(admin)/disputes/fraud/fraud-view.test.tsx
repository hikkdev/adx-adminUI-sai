import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FraudCasesPage } from "@/services/fraud";

/**
 * The fraud desk over an empty queue.
 *
 * Both by-id reads are keyed on the selected case, and the selection is the
 * first row. With no rows there is no id and no read, and the check that a
 * read belonged to the selection was `file?.id === rowId` — true for
 * `undefined === undefined`, after which `file.value` dereferenced null and
 * the boundary took the page (ERR-7F3A21C9). The desk on its first day, or
 * under a filter nothing matches, must draw its empty state instead.
 */

vi.mock("@/services/fraud", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/fraud")>();
    return {
        ...actual,
        fraudService: {
            ...actual.fraudService,
            get: vi.fn(() => Promise.reject(new Error("not read"))),
            linked: vi.fn(() => Promise.reject(new Error("not read"))),
        },
    };
});

import { fraudService } from "@/services/fraud";
import { FraudView } from "./fraud-view";

const empty: FraudCasesPage = { items: [], total: 0, page: 1, pageSize: 50, counts: {} };

describe("FraudView with nothing in the queue", () => {
    it("draws the empty state and reads nothing, rather than dereferencing a read that never happened", () => {
        render(
            <FraudView
                page={empty}
                facets={{ status: "ALL", q: "" }}
                onFacetsChange={() => {}}
                admins={[]}
                preselectId={null}
                scan={null}
            />,
        );

        expect(screen.getByText("No cases match these filters.")).toBeInTheDocument();
        expect(screen.getAllByText("Select a case").length).toBeGreaterThan(0);
        expect(fraudService.get).not.toHaveBeenCalled();
        expect(fraudService.linked).not.toHaveBeenCalled();
    });
});
