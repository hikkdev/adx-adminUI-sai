import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * QR-24 (the owner, 17 Sep 2026) — the renewals desk.
 *
 * Pinned: the queue lists every term-holding spot with how it is held, when
 * it runs out and its state; the chips narrow to the lapsed and the ending;
 * the service reads the queue with its horizon; and the sweep button posts
 * the sweep and reloads.
 */

const { backend } = vi.hoisted(() => ({
    backend: { gets: [] as string[], posts: [] as string[] },
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    return {
        ...actual,
        api: {
            get: async (path: string) => {
                backend.gets.push(path);
                return [];
            },
            post: async (path: string) => {
                backend.posts.push(path);
                return { considered: 3, lapsed: 1, reminded: 1 };
            },
            patch: async () => undefined,
            put: async () => undefined,
            delete: async () => undefined,
        },
    };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, isLive: () => true };
});

import { supplyService } from "@/services/supply";
import type { RightsQueueRow } from "@/types";
import { RenewalsQueue } from "./renewals-queue";

const row = (over: Partial<RightsQueueRow> = {}): RightsQueueRow => ({
    id: "lst_1",
    title: "Hebbal Flyover Approach — Airport Road Billboard",
    publisherId: "pub_1",
    publisherName: "Skyline Outdoor Media",
    status: "ACTIVE",
    availableNow: true,
    rightsBasis: "PERMIT",
    rightsValidUntil: "2026-10-05T23:59:59.999Z",
    rightsLapsedAt: null,
    rightsRemindedAt: null,
    state: "ENDING",
    daysLeft: 15,
    ...over,
});

describe("the service", () => {
    it("reads the queue with its horizon and posts the sweep", async () => {
        backend.gets.length = 0;
        await supplyService.rightsQueue(90);
        expect(backend.gets).toEqual(["/supply/rights-queue?horizonDays=90"]);
        await supplyService.runRightsSweep();
        expect(backend.posts).toEqual(["/supply/rights/sweep"]);
    });
});

describe("the queue", () => {
    it("lists how each spot is held, when it runs out and its state, and the chips narrow it", () => {
        render(
            <RenewalsQueue
                rows={[
                    row(),
                    row({ id: "lst_2", title: "Western Express Highway — Andheri Gantry", publisherName: "Mumbai Hoardings Co", rightsBasis: "LEASED", rightsLapsedAt: "2026-09-01T00:00:00.000Z", state: "LAPSED", daysLeft: -19, availableNow: false }),
                    row({ id: "lst_3", title: "Silk Board Flyover — Skywalk Panel", publisherName: "Metro Transit Ads Pvt Ltd", state: "CURRENT", daysLeft: 50 }),
                ]}
            />
        );
        expect(screen.getByText("Hebbal Flyover Approach — Airport Road Billboard")).toBeInTheDocument();
        expect(screen.getByText("Skyline Outdoor Media")).toBeInTheDocument();
        expect(screen.getAllByText("Permit").length).toBeGreaterThan(0);
        expect(screen.getByText("Lease")).toBeInTheDocument();
        expect(screen.getByText(/19d ago/)).toBeInTheDocument();
        expect(screen.getByText(/in 15d/)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("renewals-filter-lapsed"));
        expect(screen.queryByText("Hebbal Flyover Approach — Airport Road Billboard")).not.toBeInTheDocument();
        expect(screen.getByText("Western Express Highway — Andheri Gantry")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("renewals-filter-ending"));
        expect(screen.getByText("Hebbal Flyover Approach — Airport Road Billboard")).toBeInTheDocument();
        expect(screen.queryByText("Western Express Highway — Andheri Gantry")).not.toBeInTheDocument();
    });

    it("the sweep button posts the sweep and reloads the page", async () => {
        backend.posts.length = 0;
        const onChanged = vi.fn();
        render(<RenewalsQueue rows={[row()]} onChanged={onChanged} />);
        fireEvent.click(screen.getByTestId("renewals-sweep"));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.posts).toEqual(["/supply/rights/sweep"]);
    });

    it("says so when nothing is due", () => {
        render(<RenewalsQueue rows={[]} />);
        expect(screen.getByText("Nothing due")).toBeInTheDocument();
    });
});
