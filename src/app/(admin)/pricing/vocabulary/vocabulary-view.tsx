"use client";

import * as React from "react";
import { CheckCheck, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/adx/section-card";
import { DataTable } from "@/components/adx/data-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { EmptyState } from "@/components/adx/empty-state";
import { pricingService } from "@/services/pricing";
import { ApiError } from "@/lib/api-client";
import { runBulk } from "@/lib/run-bulk";
import type { VocabularyProposal } from "@/types/pricing-engine";

interface Props {
    proposals: VocabularyProposal[];
    onChanged: () => void;
}

const kindMeta = {
    MEDIA_TYPE: { label: "Media type", tone: "info" as const },
    SIZE_CLASS: { label: "Size class", tone: "warning" as const },
    MATERIAL: { label: "Material", tone: "neutral" as const },
};

/**
 * Values that arrived matching nothing in the controlled lists.
 *
 * They are logged rather than created, which is the whole point of having
 * controlled lists: free text is what shatters a taxonomy, and once "vinyl",
 * "Vinyl" and "flex vinyl" are three materials, every comparable pool that
 * involves them has split three ways.
 *
 * A high count is a signal, not an error. It usually means either the research
 * sheet is using a name ADX has not adopted, or ADX is missing a real medium.
 * Both are decisions for a person.
 */
export function VocabularyView({ proposals, onChanged }: Props) {
    const [busy, setBusy] = React.useState<string | null>(null);

    async function resolve(proposal: VocabularyProposal) {
        setBusy(proposal.id);
        try {
            await pricingService.resolveProposal(proposal.id, null);
            toast.success(`Cleared "${proposal.rawValue}"`, {
                description: "It will reappear if it shows up again and still matches nothing.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not clear that");
        } finally {
            setBusy(null);
        }
    }

    return (
        <SectionCard
            title="Unrecognised values"
            description={`${proposals.length} waiting. Ordered by how often each has been seen.`}
        >
            {proposals.length === 0 ? (
                <EmptyState
                    icon={ListChecks}
                    title="Nothing unrecognised"
                    description="Every media type, size class and material that has arrived so far matched the controlled lists."
                />
            ) : (
                <DataTable
                    data={proposals}
                    searchPlaceholder="Search values..."
                    initialPageSize={15}
                    bulkActions={(rows, clear) => (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                                runBulk(
                                    rows,
                                    (row) => pricingService.resolveProposal(row.id, null),
                                    "Marked handled",
                                    () => {
                                        clear();
                                        onChanged();
                                    }
                                )
                            }
                        >
                            Mark selected handled
                        </Button>
                    )}
                    columns={[
                        {
                            accessorKey: "rawValue",
                            header: "Value",
                            cell: ({ row }) => (
                                <span className="font-mono text-sm text-foreground">
                                    {row.original.rawValue}
                                </span>
                            ),
                        },
                        {
                            accessorKey: "kind",
                            header: "Kind",
                            cell: ({ row }) => <StatusBadge status={kindMeta[row.original.kind]} />,
                        },
                        {
                            accessorKey: "occurrences",
                            header: "Seen",
                            cell: ({ row }) => (
                                <span className="tabular-nums text-muted-foreground">
                                    {row.original.occurrences}x
                                </span>
                            ),
                        },
                        {
                            id: "actions",
                            header: "",
                            cell: ({ row }) => (
                                <div className="text-right">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy === row.original.id}
                                        onClick={() => resolve(row.original)}
                                    >
                                        <CheckCheck className="mr-1.5 size-3.5" aria-hidden />
                                        Mark handled
                                    </Button>
                                </div>
                            ),
                        },
                    ]}
                />
            )}
        </SectionCard>
    );
}
