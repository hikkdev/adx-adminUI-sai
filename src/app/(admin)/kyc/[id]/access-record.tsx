"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { accessService, type WirePartyLog } from "@/services/access";

/**
 * Who has had access to this publisher's account — the owner's own record,
 * read by ops beside the documents (D6).
 *
 * The same three lists the publisher sees in their app: every scan of their
 * code with who and how far (refusals included), every window of authority,
 * every change made under one. Read-only here as there; the record is the
 * record.
 */

const OUTCOME: Record<string, string> = {
    GRANTED: "approved by the owner",
    PENDING_APPROVAL: "waiting for the owner",
    USER_DECLINED: "declined by the owner",
    EXPIRED: "code had expired",
    ALREADY_USED: "code already used",
    NOT_AN_AGENT: "refused — not an ADX agent",
};

const distance = (m: number | null) => (m === null ? null : m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(1)} km away`);

export function AccessRecord({ publisherId }: { publisherId: string }) {
    const live = isLive("access");
    const resource = useApiResource<WirePartyLog | null>(`access:publisher:${publisherId}:${live}`, () =>
        accessService.partyLog("publisher", publisherId)
    );

    const log = resource.data;
    const empty = log ? log.scans.length + log.grants.length + log.changes.length === 0 : false;

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Who has had access</h3>
            {!live ? (
                <p className="mt-3 text-sm text-muted-foreground">Read from the API; turn it on to see the record.</p>
            ) : resource.loading ? (
                <p className="mt-3 text-sm text-muted-foreground">Reading the record…</p>
            ) : resource.error ? (
                <p className="mt-3 text-sm text-danger">{resource.error}</p>
            ) : !log || empty ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    Nobody has scanned this publisher&rsquo;s code and no agent has had access to the account.
                </p>
            ) : (
                <div className="mt-3 space-y-3 text-sm">
                    {log.scans.length > 0 && (
                        <Section title="Scans of their code">
                            {log.scans.map((scan) => (
                                <li key={scan.id}>
                                    <span className="font-medium text-foreground">
                                        {[scan.agent.name ?? "An ADX agent", scan.agent.displayId].filter(Boolean).join(" · ")}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {" "}
                                        — {formatDateTime(scan.at)}, {OUTCOME[scan.outcome] ?? scan.outcome}
                                        {distance(scan.distanceM) ? `, ${distance(scan.distanceM)}` : ""}
                                    </span>
                                </li>
                            ))}
                        </Section>
                    )}
                    {log.grants.length > 0 && (
                        <Section title="Windows of access">
                            {log.grants.map((grant) => (
                                <li key={grant.id} className="text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                        {grant.purpose === "ONBOARDING" ? "Onboarding" : "Support"} · {grant.scope === "LISTINGS" ? "listings" : "profile"}
                                    </span>{" "}
                                    {grant.from ? `from ${formatDateTime(grant.from)}` : ""}
                                    {grant.until ? ` until ${formatDateTime(grant.until)}` : ""}
                                    {grant.revokedAt ? ` · withdrawn ${formatDateTime(grant.revokedAt)}` : ` · ${grant.status.toLowerCase()}`}
                                </li>
                            ))}
                        </Section>
                    )}
                    {log.changes.length > 0 && (
                        <Section title="Changes made under a grant">
                            {log.changes.map((change) => (
                                <li key={change.id} className="text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                        {change.action.includes("KYC") ? "Documents submitted" : `Changed ${change.fields.join(", ") || "details"}`}
                                    </span>{" "}
                                    by {change.by.name ?? "an ADX agent"}, {formatDateTime(change.at)}
                                </li>
                            ))}
                        </Section>
                    )}
                </div>
            )}
        </Card>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <ul className="mt-1 space-y-1">{children}</ul>
        </div>
    );
}
