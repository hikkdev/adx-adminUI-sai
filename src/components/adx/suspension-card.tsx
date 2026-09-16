"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SCOPE_LABEL, scopeMeta, type SuspensionEvent, type SuspensionView } from "@/services/suspension";

interface SuspensionCardProps {
    /**
     * The case as `GET /suspension/:partyType/:partyId` sent it. Null when the
     * read failed or the API is off; the card says which.
     */
    view: SuspensionView | null;
    /** The Suspend / Reinstate pair, mounted in the card's header. */
    actions?: React.ReactNode;
    className?: string;
}

/**
 * The Suspension card on each of the four party pages — Lot A.
 *
 * What is in force now, as one chip per scope with the reason and the date
 * the case started, and under it every step and every reversal, newest
 * first. A cascaded row — a listing that took its publisher's BLOCK_NEW — is
 * marked as such, because the listing page must not read as though somebody
 * suspended the spot on its own.
 *
 * No DR 10 frame draws this card; it is composed from the console's own
 * section card and status chips.
 */
/** E6: the actor's name off the event, or the id when the platform no longer has them. */
export const actorLabel = (event: Pick<SuspensionEvent, "byUserId" | "byUser">): string =>
    event.byUser?.name?.trim() || event.byUserId;

export function SuspensionCard({ view, actions, className }: SuspensionCardProps) {
    const live = isLive("suspension");
    const inForce = view?.scopes ?? [];
    /* E10-1: the case names the actor (`suspendedBy { id, name }`); the
       event that opened it stands in for a read older than the join, and
       the id only when the platform no longer has the person. */
    const opener = view?.suspendedById
        ? view.events.find((event) => event.action === "SUSPEND" && event.byUserId === view.suspendedById)
        : undefined;
    const openerLabel = view?.suspendedById
        ? view.suspendedBy?.name?.trim() || (opener ? actorLabel(opener) : view.suspendedById)
        : null;

    return (
        <SectionCard
            className={className}
            title="Suspension"
            description={
                inForce.length
                    ? "Sections stopped, each lifted separately."
                    : "Nothing is stopped. Sections are suspended one at a time and each is recorded."
            }
            actions={actions}
        >
            {!live ? (
                <p className="text-sm text-muted-foreground">
                    Suspensions are read from the API, and the console is not connected to it. Turn the API on
                    to see what is in force.
                </p>
            ) : view === null ? (
                <p className="text-sm text-muted-foreground">The suspension record could not be read. Reload to try again.</p>
            ) : (
                <div className="space-y-4">
                    <div
                        className={cn(
                            "flex items-start gap-3 rounded-md p-3",
                            inForce.length ? "bg-danger-soft" : "bg-success-soft",
                        )}
                        data-testid="suspension-current"
                    >
                        {inForce.length ? (
                            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                        ) : (
                            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                            {inForce.length ? (
                                <>
                                    <div className="flex flex-wrap gap-1.5">
                                        {inForce.map((scope) => (
                                            <StatusBadge key={scope} status={scopeMeta(scope)} />
                                        ))}
                                    </div>
                                    <p className="mt-2 text-sm text-foreground">{view.suspensionReason ?? "No reason recorded."}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Since {view.suspendedAt ? formatDateTime(view.suspendedAt) : "—"}
                                        {openerLabel ? ` · by ${openerLabel}` : ""}
                                    </p>
                                </>
                            ) : (
                                <p className="text-sm text-success">Not suspended on any section.</p>
                            )}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h4>
                        {view.events.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">Never suspended.</p>
                        ) : (
                            <ol className="mt-2 space-y-3" data-testid="suspension-history">
                                {view.events.map((event) => (
                                    <SuspensionEventRow key={event.id} event={event} />
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

function SuspensionEventRow({ event }: { event: SuspensionEvent }) {
    const suspend = event.action === "SUSPEND";
    return (
        <li className="flex items-start gap-3 text-sm">
            <span
                className={cn(
                    "mt-1.5 inline-block size-2 shrink-0 rounded-full",
                    suspend ? "bg-danger" : "bg-success",
                )}
                aria-hidden
            />
            <div className="min-w-0 flex-1">
                <p className="text-foreground">
                    <span className="font-medium">{suspend ? "Suspended" : "Reinstated"}</span>{" "}
                    <span className="text-muted-foreground">
                        {event.scopes.length ? event.scopes.map((scope) => SCOPE_LABEL[scope] ?? scope).join(", ") : "everything"}
                    </span>
                    {event.cascaded && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            cascade from publisher
                        </span>
                    )}
                </p>
                <p className="text-xs text-muted-foreground">{event.reason}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(event.at)} · by {actorLabel(event)}
                </p>
            </div>
        </li>
    );
}
