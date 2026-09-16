"use client";

import Link from "next/link";
import { Eye, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { PUBLISHER_READS, ViewAs, type ViewAsRead } from "@/components/adx/view-as-panel";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { supportService, type RequesterPartyType, type RequesterRail as RequesterRailData } from "@/services/support";

/** What the audited session reads for each kind of requester — the party's own endpoints. */
const ADVERTISER_READS: readonly ViewAsRead[] = [{ title: "Profile · GET /advertisers/me", path: "/advertisers/me" }];
const AGENT_READS: readonly ViewAsRead[] = [
    { title: "Profile · GET /agents/me", path: "/agents/me" },
    { title: "Today · GET /agents/me/day", path: "/agents/me/day" },
];

export function readsFor(type: RequesterPartyType | null): readonly ViewAsRead[] {
    switch (type) {
        case "PUBLISHER":
            return PUBLISHER_READS;
        case "ADVERTISER":
            return ADVERTISER_READS;
        case "AGENT":
            return AGENT_READS;
        default:
            return [];
    }
}

/**
 * The requester rail beside the thread — DR 10 "Support · /support" (E7-3).
 *
 * `GET /support/tickets/:id/requester`: the name and role, the party record
 * (its displayId links to the party page), the wallet balance, what they
 * have running, how many tickets they hold open, and the last ten things
 * the audit trail says they did. "View in admin" opens the party page, or
 * the account when the login has no record. "Start audited session" is Lot
 * D's read-only view-as on the requester's account — the same
 * `POST /users/:id/impersonate` the publisher page uses — and reads the
 * party's own endpoints; it is offered only when there is an account and a
 * party type with endpoints to read.
 */
export function RequesterRail({ ticketId }: { ticketId: string }) {
    const resource = useApiResource<RequesterRailData>(`support:requester:${ticketId}`, () => supportService.requester(ticketId));
    const rail = resource.data;

    return (
        <Card className="rounded-lg border-border p-4 shadow-none" data-testid="requester-rail">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requester</h3>
            {!rail && resource.loading && <p className="mt-2 text-sm text-muted-foreground">Reading who raised it…</p>}
            {!rail && resource.error && <p className="mt-2 text-sm text-danger">{resource.error}</p>}
            {rail && (
                <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2.5">
                        <InitialsAvatar name={rail.name} size="sm" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{rail.name}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <StatusBadge status={{ label: rail.roleLabel, tone: rail.role ? "info" : "neutral" }} />
                                {rail.party?.displayId && (
                                    <Link href={rail.party.href} className="font-mono underline-offset-4 hover:underline">
                                        {rail.party.displayId}
                                    </Link>
                                )}
                                {rail.party?.kycStatus && <span className="capitalize">KYC {rail.party.kycStatus.toLowerCase().replace(/_/g, " ")}</span>}
                            </div>
                        </div>
                    </div>

                    <dl className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-muted/60 px-2 py-2">
                            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Wallet</dt>
                            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                                {rail.walletBalance === null ? "—" : formatMoney(rail.walletBalance)}
                            </dd>
                        </div>
                        <div className="rounded-md bg-muted/60 px-2 py-2">
                            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Open orders</dt>
                            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{rail.openOrders}</dd>
                        </div>
                        <div className="rounded-md bg-muted/60 px-2 py-2">
                            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Open tickets</dt>
                            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{rail.openTickets}</dd>
                        </div>
                    </dl>

                    <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent activity</p>
                        {rail.recentActivity.length === 0 ? (
                            <p className="mt-1 text-xs text-muted-foreground">Nothing on the audit trail yet.</p>
                        ) : (
                            <ul className="mt-1 space-y-1">
                                {rail.recentActivity.slice(0, 5).map((row, index) => (
                                    <li key={`${row.action}-${row.at}-${index}`} className="flex items-baseline justify-between gap-2 text-xs">
                                        <span className="truncate text-foreground">{row.label}</span>
                                        <span className="shrink-0 text-muted-foreground">{formatDateTime(row.at)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {rail.adminHref && (
                            <Button variant="outline" size="sm" className="h-8 bg-card" asChild>
                                <Link href={rail.adminHref}>
                                    <ExternalLink className="mr-1.5 size-3.5" aria-hidden />
                                    View in admin
                                </Link>
                            </Button>
                        )}
                        {rail.userId && rail.party && (
                            <ViewAs userId={rail.userId} partyName={rail.name} reads={readsFor(rail.party.type)}>
                                {({ start }) => (
                                    <Button variant="outline" size="sm" className="h-8 bg-card" disabled={!start} onClick={() => start?.()}>
                                        <Eye className="mr-1.5 size-3.5" aria-hidden />
                                        Start audited session
                                    </Button>
                                )}
                            </ViewAs>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}
