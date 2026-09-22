import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * AG-5 (the owner, 20 Sep 2026) — fleet partners and routing in the console.
 *
 * Pinned: the paste box is read a rider per line; the invite posts the rows
 * and prints the numbers that were not numbers; the routing settings page
 * saves the bands-to-grades map; the band control on a party posts to its
 * own door.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const { backend } = vi.hoisted(() => ({ backend: { calls: [] as { method: string; path: string; body?: unknown }[], reply: {} as Record<string, unknown> } }));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/agents/fleets", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const answer = (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        return Promise.resolve(backend.reply[`${method} ${path}`] ?? backend.reply[`${method} *`]);
    };
    return {
        ...actual,
        api: { get: (p: string) => answer("GET", p), post: (p: string, b?: unknown) => answer("POST", p, b), patch: (p: string, b?: unknown) => answer("PATCH", p, b), put: (p: string, b?: unknown) => answer("PUT", p, b), delete: (p: string) => answer("DELETE", p), getEnvelope: (p: string) => answer("GET", p) },
    };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api-config", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-config")>()), isLive: () => true }));

import { parseInviteRows, type FleetInvite, type FleetPartner, type RoutingSettings } from "@/services/agent-applications";
import { PartyBandControl } from "@/components/adx/party-band-control";
import { FleetDetail } from "./[id]/fleet-detail";
import { RoutingView } from "../../settings/agent-routing/routing-view";

const partner: FleetPartner = { id: "fp_1", name: "Swift Riders", platform: "ZOMATO", contactName: "Arun", phone: "+919000000100", email: null, city: "Bengaluru", notes: null, isActive: true, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z", invites: { sent: 1, applied: 0, activated: 0 } };
const invite: FleetInvite = { id: "inv_1", mobile: "+919000000001", name: "Ravi", status: "SENT", sentAt: "2026-09-21T00:00:00.000Z", appliedAt: null, agent: null };

describe("the paste box", () => {
    it("reads a rider per line, a name after a comma, and skips blank lines", () => {
        expect(parseInviteRows("9000000001, Ravi\n\n+91 9000000002\n9000000003;Meena Devi\n")).toEqual([
            { mobile: "9000000001", name: "Ravi" },
            { mobile: "+91 9000000002" },
            { mobile: "9000000003", name: "Meena Devi" },
        ]);
    });
});

describe("the fleet partner", () => {
    it("invites the pasted riders and prints what was not a number", async () => {
        backend.calls.length = 0;
        backend.reply = { "POST /agents/fleet-partners/fp_1/invites": { invited: 1, duplicates: 1, rejected: [{ mobile: "12345", reason: "Not an Indian mobile number" }], sent: 1, invites: [invite] } };
        const onChanged = vi.fn();
        render(<FleetDetail partner={partner} invites={[invite]} onChanged={onChanged} />);
        expect(screen.getByText("+919000000001")).toBeInTheDocument();
        fireEvent.change(screen.getByTestId("fleet-paste"), { target: { value: "9000000001\n9000000002, Meena\n12345" } });
        expect(screen.getByText("3 rows to invite")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("fleet-invite"));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "POST", path: "/agents/fleet-partners/fp_1/invites", body: { rows: [{ mobile: "9000000001" }, { mobile: "9000000002", name: "Meena" }, { mobile: "12345" }] } })));
        await waitFor(() => expect(screen.getByTestId("fleet-rejected")).toHaveTextContent("12345"));
        expect(onChanged).toHaveBeenCalled();
    });
});

describe("routing settings", () => {
    it("saves the bands-to-grades map and the enforce switch", async () => {
        backend.calls.length = 0;
        const settings: RoutingSettings = { bands: { INDIVIDUAL: "G1", SMALL_AGENCY: "G2", LARGE_AGENCY: "G3" }, leadBands: { STANDARD: "G1", KEY: "G3", ENTERPRISE: "G4" }, enforce: true };
        backend.reply = { "PUT /agents/routing-settings": settings };
        const onSaved = vi.fn();
        render(<RoutingView settings={settings} onSaved={onSaved} />);
        expect(screen.getByTestId("routing-save")).toBeDisabled();
        fireEvent.click(screen.getByTestId("routing-enforce"));
        expect(screen.getByTestId("routing-save")).toBeEnabled();
        fireEvent.click(screen.getByTestId("routing-save"));
        await waitFor(() => expect(backend.calls).toContainEqual(expect.objectContaining({ method: "PUT", path: "/agents/routing-settings", body: { ...settings, enforce: false } })));
        expect(onSaved).toHaveBeenCalled();
    });
});

describe("the band control", () => {
    it("reads an unset band as individual and posts a change to the party's own door", async () => {
        backend.calls.length = 0;
        backend.reply = { "PATCH /publishers/pub_1/band": {} };
        const onChanged = vi.fn();
        render(<PartyBandControl party="publishers" partyId="pub_1" value={null} onChanged={onChanged} />);
        expect(screen.getByTestId("party-band-select")).toHaveTextContent("Individual / small publisher");
        fireEvent.keyDown(screen.getByTestId("party-band-select"), { key: "ArrowDown" });
        fireEvent.keyDown(await screen.findByRole("option", { name: "Large agency / media owner" }), { key: "Enter" });
        await waitFor(() => expect(backend.calls).toContainEqual({ method: "PATCH", path: "/publishers/pub_1/band", body: { sizeBand: "LARGE_AGENCY" } }));
        expect(onChanged).toHaveBeenCalled();
    });
});
