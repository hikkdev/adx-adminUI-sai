"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { listingsService, type AdminListingDetail, type VehicleRcPayload } from "@/services/listings";

/**
 * VH-1: is this the publisher's vehicle?
 *
 * A moving ad spot is a vehicle somebody owns, and the only thing that
 * settles whose it is is the RC register. The desk types the registration
 * and presses Verify; the server asks the vendor, stores what came back, and
 * says how closely the RC's owner matches the publisher's own name.
 *
 * Three things this card is careful about.
 *
 * **A score, not a verdict.** Names are spelled differently on every
 * document in India — an initial here, a surname first there. A hard
 * pass/fail would either turn honest publishers away or wave anybody
 * through, so the match is a number and a person decides.
 *
 * **Unchecked is not failed.** A vehicle nobody has verified says so plainly.
 * The vendor is behind Cashfree's IP whitelist, so "could not check" is a
 * normal answer today and must never read as "this vehicle is not theirs".
 *
 * **The papers matter as much as the owner.** Insurance, fitness and PUC
 * dates come back with the lookup and are shown, because a van with expired
 * fitness is a spot that will be off the road mid-campaign.
 */
export function ListingVehicleCard({
    listing,
    onChanged,
    className,
}: {
    listing: AdminListingDetail;
    onChanged?: () => void;
    className?: string;
}) {
    const [number, setNumber] = React.useState(listing.vehicleNumber ?? "");
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);

    const rc = listing.vehicleRcPayload;
    const plate = number.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const ready = plate.length >= 4 && !busy;

    async function verify() {
        if (!ready) return;
        setBusy(true);
        setProblem(null);
        try {
            const answer = await listingsService.verifyVehicleRc(listing.id, plate);
            const owner = answer.verification.facts.ownerName;
            toast.success(`${plate} checked`, {
                description: owner
                    ? `Registered to ${owner} — ${answer.verification.nameMatch}% match with the publisher's name.`
                    : "The RC answered, but named no owner.",
            });
            onChanged?.();
        } catch (cause) {
            /* A vendor that cannot answer is not a vehicle that failed, and
               the difference is the whole point of this message. */
            setProblem(
                cause instanceof ApiError
                    ? `Could not check it: ${cause.message}`
                    : "Could not check it. The RC lookup did not answer.",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className={className} data-testid="listing-vehicle-card">
            <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-base font-semibold text-foreground">Vehicle</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            A moving spot belongs to somebody. The RC register is what says who.
                        </p>
                    </div>
                    {listing.vehicleRcVerifiedAt ? (
                        <StatusBadge status={{ label: `Checked ${formatDateTime(listing.vehicleRcVerifiedAt)}`, tone: "success" }} />
                    ) : (
                        <StatusBadge status={{ label: "Not checked", tone: "neutral" }} />
                    )}
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="grid min-w-[12rem] flex-1 gap-1.5">
                        <Label htmlFor="listing-vehicle-number">Registration number</Label>
                        <Input
                            id="listing-vehicle-number"
                            value={number}
                            onChange={(event) => setNumber(event.target.value)}
                            placeholder="KA 01 AB 1234"
                            autoCapitalize="characters"
                            className="h-9 uppercase tabular-nums"
                        />
                    </div>
                    <Button onClick={() => void verify()} disabled={!ready}>
                        {busy ? "Checking…" : "Verify"}
                    </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                    Typed off the plate; spaces and case do not matter. Checking stores what the register said, so the
                    answer can be read again without asking the vendor twice.
                </p>

                {problem && <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{problem}</p>}

                {rc ? <RcFacts rc={rc} /> : null}
            </div>
        </Card>
    );
}

/** What the register said, and how well the owner matches the publisher. */
function RcFacts({ rc }: { rc: VehicleRcPayload }) {
    const match = typeof rc.nameMatch === "number" ? rc.nameMatch : null;
    const vehicle = [rc.maker, rc.model].filter(Boolean).join(" ");
    return (
        <>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
                <Fact label="Registered to" value={rc.ownerName ?? null} />
                <Fact label="Vehicle" value={vehicle || null} />
                <Fact label="Class" value={rc.vehicleClass ?? null} />
                <Fact label="Insurance to" value={rc.insuranceUpto ?? null} />
                <Fact label="Fitness to" value={rc.fitnessUpto ?? null} />
                <Fact label="PUC to" value={rc.pucUpto ?? null} />
            </dl>
            {match !== null && (
                <p className="mt-3 text-xs text-muted-foreground" data-testid="listing-vehicle-match">
                    {/* A score, because names are written differently on every document. */}
                    <span className={match >= 80 ? "font-medium text-success" : match >= 50 ? "font-medium text-warning" : "font-medium text-danger"}>
                        {match}% match
                    </span>{" "}
                    between the RC&rsquo;s owner and {rc.publisherName ?? "the publisher"}.{" "}
                    {match >= 80
                        ? "Close enough to read as the same person."
                        : match >= 50
                          ? "Partly matching — worth a look before this spot goes live."
                          : "Different names. Ask whose vehicle this is before publishing."}
                </p>
            )}
        </>
    );
}

function Fact({ label, value }: { label: string; value: string | null }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value ?? "—"}</dd>
        </div>
    );
}
