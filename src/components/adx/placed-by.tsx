"use client";

import Link from "next/link";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import type { OrderPlacedBy } from "@/types";

/**
 * PB-1 (the owner, 2 Oct 2026): "who placed the order or what business".
 *
 * One shape for "the advertiser behind this record" — the person (their
 * ADX-…) and, when the login holds one, the advertiser profile (ADV-…). The
 * orders list sends it as `placedBy`, the campaigns list and the landing
 * pages as `advertiser`; both draw through the helpers here so the two read
 * the same way and open the same pages.
 */
export type PartyRef = OrderPlacedBy;

/** What a party cell prints and where it leads. Null when the read carried nobody. */
export interface PartyRefView {
    /** The business, else the person. */
    title: string;
    /** ADV-… · the person under a business; the person's ADX-… otherwise. */
    detail: string;
    person: string;
    href: string;
}

export function placedByView(placedBy: PartyRef | null | undefined): PartyRefView | null {
    if (!placedBy) return null;
    const person = placedBy.name?.trim() || placedBy.displayId || "Unnamed person";
    const business = placedBy.business;
    if (business) {
        return {
            title: business.name,
            detail: [business.displayId, placedBy.name?.trim()].filter(Boolean).join(" · "),
            person,
            href: `/advertisers/${business.id}`,
        };
    }
    return {
        title: person,
        detail: placedBy.displayId ?? "ADX ID not issued yet",
        person,
        href: `/users/${placedBy.userId}`,
    };
}

/**
 * The rosters' Name cell, two lines: the business, with ADV-… and the
 * person muted beneath, opening the advertiser; with no business, the
 * person and their ADX-…, opening the user. A dash when the read carried
 * nobody.
 */
export function PlacedByCell({ placedBy, testId = "placed-by" }: { placedBy: PartyRef | null | undefined; testId?: string }) {
    const view = placedByView(placedBy);
    if (!view) return <span className="text-muted-foreground">—</span>;
    return (
        <Link href={view.href} onClick={(event) => event.stopPropagation()} className="group flex min-w-0 items-center gap-2.5" data-testid={testId}>
            <InitialsAvatar name={view.title} size="sm" />
            <div className="min-w-0">
                <p className="truncate font-medium text-foreground underline-offset-4 group-hover:underline">{view.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{view.detail}</p>
            </div>
        </Link>
    );
}

/**
 * The same party as one sentence under a page title — "Placed by Rao Sweets
 * (Asha Rao) on 2 Oct, 3:45 pm". The business opens the advertiser, the
 * person opens the user; with no business, the person and their ADX-… lead.
 * `lead` is the verb ("Placed by", "Booked for"); `when` the time already
 * formatted, or null to leave it off. With nobody to name, `fallback`.
 */
export function PlacedByLine({
    placedBy,
    lead,
    when,
    fallback,
    testId = "placed-by-line",
}: {
    placedBy: PartyRef | null | undefined;
    lead: string;
    when: string | null;
    fallback: string;
    testId?: string;
}) {
    const link = "text-foreground underline-offset-4 hover:underline";
    if (!placedBy) {
        return (
            <p className="mt-1 text-sm text-muted-foreground" data-testid={testId}>
                {fallback}
            </p>
        );
    }
    const person = placedBy.name?.trim() || placedBy.displayId || "Unnamed person";
    return (
        <p className="mt-1 text-sm text-muted-foreground" data-testid={testId}>
            {lead}{" "}
            {placedBy.business ? (
                <>
                    <Link href={`/advertisers/${placedBy.business.id}`} className={link}>
                        {placedBy.business.name}
                    </Link>{" "}
                    (
                    <Link href={`/users/${placedBy.userId}`} className={link}>
                        {person}
                    </Link>
                    )
                </>
            ) : (
                <>
                    <Link href={`/users/${placedBy.userId}`} className={link}>
                        {person}
                    </Link>
                    {placedBy.displayId && placedBy.name?.trim() ? (
                        <>
                            {" "}
                            <span className="font-mono text-xs">{placedBy.displayId}</span>
                        </>
                    ) : null}
                </>
            )}
            {when ? ` on ${when}` : null}
        </p>
    );
}
