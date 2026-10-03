import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Settings › Integrations › Holiday calendar — HC-1 (1 Oct 2026).
 *
 * What is pinned: the card draws the switch, the observances choice, the
 * address behind "Calendar address (advanced)", and the last sync in plain
 * words; Save sends only what moved (a blank address goes back to
 * Google's, `url: null`), and refuses an address that is not https before
 * the round trip; "Sync now" needs `hr.edit` and waits until the calendar
 * is on and the form is saved.
 */

const { backend, toast, perms } = vi.hoisted(() => ({
    backend: {
        puts: [] as { section: string; patch: Record<string, unknown> }[],
        syncs: 0,
        calendar: null as unknown,
    },
    toast: { success: vi.fn(), error: vi.fn() },
    perms: { held: new Set<string>(["hr.edit"]) },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/auth", () => ({ useOptionalAuth: () => ({ can: (id: string) => perms.held.has(id) }) }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            ...actual.api,
            get: async (path: string) => {
                if (path === "/hr/holidays/calendar") return backend.calendar;
                throw new Error(`unexpected GET ${path}`);
            },
            post: async (path: string) => {
                if (path === "/hr/holidays/sync") {
                    backend.syncs += 1;
                    return { added: 18, updated: 0, adopted: 0, skipped: 0, years: [2026, 2027] };
                }
                throw new Error(`unexpected POST ${path}`);
            },
            put: async (_path: string, body: { section: string; patch: Record<string, unknown> }) => {
                backend.puts.push(body);
                return {};
            },
        },
    };
});

import { GOOGLE_INDIA_HOLIDAYS_URL } from "@/services/employees";
import type { HolidayCalendarSettings } from "@/services/integrations";
import { HolidayCalendarSection, holidayCalendarPatch } from "./holiday-calendar-section";

const stored = (over: Partial<HolidayCalendarSettings> = {}): HolidayCalendarSettings => ({
    enabled: true,
    url: GOOGLE_INDIA_HOLIDAYS_URL,
    includeObservances: false,
    ...over,
});

beforeEach(() => {
    backend.puts = [];
    backend.syncs = 0;
    backend.calendar = {
        enabled: true,
        url: GOOGLE_INDIA_HOLIDAYS_URL,
        includeObservances: false,
        lastSync: { at: "2026-10-01T21:30:00.000Z", added: 18, updated: 0, adopted: 0, skipped: 0, error: null, years: [2026, 2027] },
    };
    perms.held = new Set(["hr.edit"]);
    toast.success.mockReset();
    toast.error.mockReset();
});

const save = () => screen.getByRole("button", { name: "Save holiday calendar" });

describe("the Holiday calendar card", () => {
    it("draws the switches, the last sync, and keeps the address tucked away", async () => {
        render(<HolidayCalendarSection stored={stored()} onChanged={() => {}} />);
        expect(screen.getByText("Holiday calendar")).toBeInTheDocument();
        expect(screen.getByText("On")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Sync holidays from the calendar" })).toBeChecked();
        expect(screen.getByRole("switch", { name: "Include observances as optional holidays" })).not.toBeChecked();
        expect(screen.queryByLabelText("Calendar address")).toBeNull();
        await waitFor(() => expect(screen.getByTestId("holiday-calendar-last-sync")).toHaveTextContent("Last synced 2 Oct, 03:00 · 18 added."));
        expect(save()).toBeDisabled();
    });

    it("saves only what moved", async () => {
        const onChanged = vi.fn();
        render(<HolidayCalendarSection stored={stored()} onChanged={onChanged} />);
        fireEvent.click(screen.getByRole("switch", { name: "Include observances as optional holidays" }));
        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toEqual([{ section: "holidayCalendar", patch: { includeObservances: true } }]));
        expect(onChanged).toHaveBeenCalled();
    });

    it("refuses an address that is not https, and a blank one goes back to Google's", async () => {
        render(<HolidayCalendarSection stored={stored({ url: "https://example.com/team.ics" })} onChanged={() => {}} />);
        // A custom address opens the advanced part on its own.
        const url = screen.getByLabelText("Calendar address");
        fireEvent.change(url, { target: { value: "http://example.com/team.ics" } });
        expect(screen.getByText("The calendar address must start with https://")).toBeInTheDocument();
        fireEvent.click(save());
        expect(backend.puts).toEqual([]);

        fireEvent.change(url, { target: { value: "" } });
        fireEvent.click(save());
        await waitFor(() => expect(backend.puts).toEqual([{ section: "holidayCalendar", patch: { url: null } }]));
        expect(holidayCalendarPatch(stored(), { enabled: true, includeObservances: false, url: "" })).toEqual({});
    });

    it("Sync now runs the sync, and waits for a saved, switched-on calendar", async () => {
        const { unmount } = render(<HolidayCalendarSection stored={stored()} onChanged={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Holidays synced", { description: "18 added." }));
        expect(backend.syncs).toBe(1);

        fireEvent.click(screen.getByRole("switch", { name: "Include observances as optional holidays" }));
        expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
        unmount();

        render(<HolidayCalendarSection stored={stored({ enabled: false })} onChanged={() => {}} />);
        expect(screen.getByText("Off")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    });

    it("offers no Sync now without hr.edit, and says so when an older server has no section", () => {
        perms.held = new Set();
        const { unmount } = render(<HolidayCalendarSection stored={stored()} onChanged={() => {}} />);
        expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
        unmount();
        render(<HolidayCalendarSection stored={undefined} onChanged={() => {}} />);
        expect(screen.getByTestId("holiday-calendar-absent")).toBeInTheDocument();
    });

    it("tells a failed last sync in plain words", async () => {
        backend.calendar = {
            enabled: true,
            url: GOOGLE_INDIA_HOLIDAYS_URL,
            includeObservances: false,
            lastSync: { at: "2026-10-01T21:30:00.000Z", added: 0, updated: 0, adopted: 0, skipped: 0, error: "The calendar answered with an error (HTTP 404).", years: [2026] },
        };
        render(<HolidayCalendarSection stored={stored()} onChanged={() => {}} />);
        await waitFor(() =>
            expect(screen.getByTestId("holiday-calendar-last-sync")).toHaveTextContent(
                "The last sync on 2 Oct, 03:00 didn't work. The calendar answered with an error (HTTP 404). Nothing was changed.",
            ),
        );
    });
});
