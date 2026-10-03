import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The Holidays page and the public holiday calendar — HC-1 (1 Oct 2026).
 *
 * What is pinned: "Sync now" sits in the header's actions beside Add
 * holiday, only for `hr.edit`, and is drawn disabled while the sync is off;
 * one line under the header says where the days come from and how the last
 * sync went (or the failure in plain words, or that the sync is off); every
 * row says "From calendar" or "Added by hand", and "Tentative date" where
 * the calendar says so; deleting a calendar row says it won't come back;
 * editing one says the calendar stops updating it.
 */

const { backend, toast } = vi.hoisted(() => ({
    backend: {
        syncs: 0,
        deletes: [] as string[],
        syncFailure: null as Error | null,
    },
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/employees/holidays",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/services/employees", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/services/employees")>();
    return {
        ...actual,
        employeesService: {
            ...actual.employeesService,
            syncHolidays: async () => {
                backend.syncs += 1;
                if (backend.syncFailure) throw backend.syncFailure;
                return { added: 18, updated: 2, adopted: 0, skipped: 0, years: [2026, 2027] };
            },
            deleteHoliday: async (id: string) => {
                backend.deletes.push(id);
                return { message: "Holiday hidden", hidden: true };
            },
        },
    };
});

import { ApiError } from "@/lib/api-client";
import {
    GOOGLE_INDIA_HOLIDAYS_URL,
    holidayCalendarLine,
    syncCountsLine,
    type Holiday,
    type HolidayCalendarView,
} from "@/services/employees";
import { HolidaysView } from "./holidays-view";

const holidays: Holiday[] = [
    { id: "hol_1", date: "2026-10-20", name: "Dussehra", region: null, kind: "PUBLIC", source: "CALENDAR", tentative: false },
    { id: "hol_2", date: "2026-11-09", name: "Office day off", region: null, kind: "PUBLIC", source: "MANUAL", tentative: false },
    { id: "hol_3", date: "2026-12-24", name: "Christmas Eve", region: null, kind: "OPTIONAL", source: "CALENDAR", tentative: true },
];

const calendar = (over: Partial<HolidayCalendarView> = {}): HolidayCalendarView => ({
    enabled: true,
    url: GOOGLE_INDIA_HOLIDAYS_URL,
    includeObservances: false,
    // 2 Oct 2026, 03:00 IST.
    lastSync: { at: "2026-10-01T21:30:00.000Z", added: 18, updated: 0, adopted: 0, skipped: 0, error: null, years: [2026, 2027] },
    ...over,
});

function renderView(props: Partial<React.ComponentProps<typeof HolidaysView>> = {}) {
    const onSynced = vi.fn();
    const onChanged = vi.fn();
    render(
        <HolidaysView
            holidays={holidays}
            year={2026}
            today="2026-10-02"
            calendar={calendar()}
            maySync
            onYearChange={() => {}}
            onChanged={onChanged}
            onSynced={onSynced}
            {...props}
        />,
    );
    return { onSynced, onChanged };
}

beforeEach(() => {
    backend.syncs = 0;
    backend.deletes = [];
    backend.syncFailure = null;
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("the line under the header", () => {
    it("says where the days come from, when they last synced and what came in", () => {
        renderView();
        expect(screen.getByTestId("holiday-calendar-line")).toHaveTextContent(
            "Synced from Google's Holidays in India calendar · last synced 2 Oct, 03:00 · 18 added",
        );
    });

    it("says the failure in plain words, that the sync is off, or that it has not run yet", () => {
        expect(
            holidayCalendarLine(
                calendar({ lastSync: { at: "2026-10-01T21:30:00.000Z", added: 0, updated: 0, adopted: 0, skipped: 0, error: "The calendar could not be reached.", years: [2026] } }),
            ),
        ).toBe("The last sync on 2 Oct, 03:00 didn't work. The calendar could not be reached. Nothing was changed.");
        expect(holidayCalendarLine(calendar({ enabled: false }))).toBe("Calendar sync is off");
        expect(holidayCalendarLine(calendar({ lastSync: null }))).toBe("Synced from Google's Holidays in India calendar · not synced yet");
        expect(holidayCalendarLine(calendar({ url: "https://example.com/team.ics", lastSync: null }))).toBe("Synced from your holiday calendar · not synced yet");
        expect(holidayCalendarLine(null)).toBeNull();
        expect(syncCountsLine({ added: 0, updated: 0, adopted: 0, skipped: 0 })).toBe("nothing new");
        expect(syncCountsLine({ added: 3, updated: 1, adopted: 2, skipped: 1 })).toBe("3 added · 1 updated · 2 taken over from the old list · 1 left as you set it");
    });

    it("is left out when the calendar cannot be read", () => {
        renderView({ calendar: null });
        expect(screen.queryByTestId("holiday-calendar-line")).toBeNull();
        expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
    });
});

describe("Sync now", () => {
    it("sits beside Add holiday, syncs, says what came in and refreshes the page", async () => {
        const { onSynced } = renderView();
        const button = screen.getByRole("button", { name: "Sync now" });
        expect(button.parentElement).toBe(screen.getByRole("button", { name: "Add holiday" }).parentElement);
        fireEvent.click(button);
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Holidays synced", { description: "18 added · 2 updated." }));
        expect(backend.syncs).toBe(1);
        expect(onSynced).toHaveBeenCalled();
    });

    it("shows the server's sentence when the calendar cannot be read", async () => {
        backend.syncFailure = new ApiError(502, "HOLIDAY_CALENDAR_UNAVAILABLE", "The calendar did not answer within 15 seconds.");
        const { onSynced } = renderView();
        fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The calendar did not answer within 15 seconds."));
        expect(onSynced).toHaveBeenCalled();
    });

    it("is not offered without hr.edit, and is disabled while the sync is off", () => {
        const { unmount } = render(
            <HolidaysView holidays={holidays} year={2026} today="2026-10-02" calendar={calendar()} maySync={false} onYearChange={() => {}} onChanged={() => {}} />,
        );
        expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
        unmount();
        renderView({ calendar: calendar({ enabled: false }) });
        expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
        expect(screen.getByTestId("holiday-calendar-line")).toHaveTextContent("Calendar sync is off");
    });
});

describe("the rows", () => {
    it("say where each day came from, and which dates are tentative", () => {
        renderView();
        const dussehra = screen.getByText("Dussehra").closest("tr")!;
        expect(within(dussehra).getByText("From calendar")).toBeInTheDocument();
        expect(within(dussehra).queryByText("Tentative date")).toBeNull();
        const typed = screen.getByText("Office day off").closest("tr")!;
        expect(within(typed).getByText("Added by hand")).toBeInTheDocument();
        const eve = screen.getByText("Christmas Eve").closest("tr")!;
        expect(within(eve).getByText("Tentative date")).toBeInTheDocument();
    });

    it("deleting a calendar row says it won't come back at the next sync", async () => {
        renderView();
        fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Dussehra" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
        expect(await screen.findByText(/It won't come back at the next sync\./)).toBeInTheDocument();
    });

    it("deleting a typed row does not", async () => {
        renderView();
        fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Office day off" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
        expect(await screen.findByText(/stops shading the staff diary\.$/)).toBeInTheDocument();
        expect(screen.queryByText(/It won't come back/)).toBeNull();
    });

    it("editing a calendar row says the edit keeps the person's version", async () => {
        renderView();
        fireEvent.pointerDown(screen.getByRole("button", { name: "Actions for Dussehra" }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
        expect(await screen.findByTestId("holiday-calendar-edit-note")).toHaveTextContent(
            "Editing it keeps your version; the calendar stops updating it.",
        );
    });
});
