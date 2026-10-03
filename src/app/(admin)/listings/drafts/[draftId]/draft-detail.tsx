"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DetailShell } from "@/components/adx/detail-shell";
import { useRosterPermission } from "@/components/adx/party-roster-row-actions";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { isLive } from "@/lib/api-config";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { listingCategoryLabel, listingsService, type ListingDraftDetail } from "@/services/listings";
import { DRAFT_DELETE_PERMISSION, DeleteDraftDialog, draftStepLabel, idleLabel } from "../../listing-drafts";

/**
 * One listing draft, opened from the Listings table (2 Oct 2026). What the
 * desk can see of a spot a publisher saved half-way: who to call, where
 * they stopped, and the answers their phone kept — read-only, because the
 * draft is the publisher's to finish. "Delete draft" throws it away.
 */
export function DraftDetailLoader({ id }: { id: string }) {
    const resource = useApiResource<ListingDraftDetail>(`listings:draft:${id}`, () => listingsService.draft(id));
    return <ResourceBoundary resource={resource}>{(draft) => <DraftDetail draft={draft} />}</ResourceBoundary>;
}

/** An answer as the desk reads it: words for the plain values, the JSON for anything nested. */
export function answerText(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) return value.join(", ") || "—";
    return JSON.stringify(value);
}

/** `venue_type_id` → "Venue type id". */
export const answerLabel = (key: string): string => {
    const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
};

export function DraftDetail({ draft }: { draft: ListingDraftDetail }) {
    const router = useRouter();
    const mayDelete = useRosterPermission(DRAFT_DELETE_PERMISSION) && isLive("listings");
    const [deleting, setDeleting] = React.useState(false);
    const answers = Object.entries(draft.answers ?? {});

    return (
        <>
            <DetailShell
                backHref="/listings/directory?status=DRAFTS"
                backLabel="Listing drafts"
                title={draft.title ?? "Untitled draft"}
                subtitle={[draft.displayId, "Draft", draft.publisher.name].join(" · ")}
                actions={
                    mayDelete ? (
                        <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setDeleting(true)}>
                            Delete draft
                        </Button>
                    ) : undefined
                }
                kpis={[
                    { id: "category", label: "Category", value: draft.category ? listingCategoryLabel(draft.category) : "Not chosen yet" },
                    { id: "step", label: "Stopped at", value: draftStepLabel(draft) },
                    { id: "idle", label: "Untouched for", value: idleLabel(draft.idleDays) },
                    { id: "saved", label: "Last saved", value: formatDate(draft.updatedAt), hint: `Started ${formatDate(draft.createdAt)}` },
                ]}
                tabs={[
                    {
                        value: "overview",
                        label: "Overview",
                        content: (
                            <div className="grid gap-4 lg:grid-cols-2">
                                <SectionCard title="Publisher" description="Who to call to finish it.">
                                    <FieldList
                                        items={[
                                            [
                                                "Name",
                                                <Link key="name" href={`/publishers/${draft.publisher.id}`} className="inline-flex items-center gap-1 hover:underline">
                                                    {draft.publisher.name}
                                                    <VerifiedTick kycStatus={draft.publisher.kycStatus} size={12} />
                                                </Link>,
                                            ],
                                            ["Account ID", draft.publisher.displayId ?? "—"],
                                            [
                                                "Mobile",
                                                <a key="mobile" href={`tel:${draft.publisher.mobile}`} className="hover:underline">
                                                    {draft.publisher.mobile}
                                                </a>,
                                            ],
                                            ["City", draft.publisher.city ?? "—"],
                                            ["Last saved", formatDateTime(draft.updatedAt)],
                                        ]}
                                    />
                                </SectionCard>
                                <SectionCard title="What they filled in" description="The answers as their phone saved them. The listing takes this reference when they finish.">
                                    {answers.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Nothing filled in yet.</p>
                                    ) : (
                                        <FieldList items={answers.map(([key, value]) => [answerLabel(key), <span key={key} className="break-all">{answerText(value)}</span>])} />
                                    )}
                                </SectionCard>
                            </div>
                        ),
                    },
                ]}
            />
            <DeleteDraftDialog
                draft={deleting ? draft : null}
                onOpenChange={(open) => !open && setDeleting(false)}
                onDeleted={() => router.push("/listings/directory?status=DRAFTS")}
            />
        </>
    );
}
