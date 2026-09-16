"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { shortId } from "@/services/finance";
import {
    PUBLISHER_INVOICE_STATUS_META,
    PUBLISHER_INVOICE_STATUSES,
    invoicesService,
    periodLabel,
    type ListPage,
    type PublisherInvoice,
    type PublisherInvoiceStatus,
} from "@/services/invoices";
import type { RosterPublisher } from "@/services/supply";

interface PublisherInvoicesViewProps {
    page: ListPage<PublisherInvoice>;
    publishers: RosterPublisher[];
    status: PublisherInvoiceStatus | "ALL";
    onStatusChange: (status: PublisherInvoiceStatus | "ALL") => void;
    onChanged: () => void;
}

type Decision = { row: PublisherInvoice; status: "MATCHED" | "REJECTED" };

/**
 * The uploads, and the two decisions on each.
 *
 * ADX is the payer here, not the supplier: the monthly payment advice a
 * publisher downloads is not a tax invoice, so a GST-registered publisher
 * raises their own and uploads it, and the desk matches it against the
 * month's statement so ADX can claim the input credit. A rejection needs a
 * note — the backend refuses one without — because the publisher replaces
 * the file in place and should know what to fix.
 */
export function PublisherInvoicesView({
    page,
    publishers,
    status,
    onStatusChange,
    onChanged,
}: PublisherInvoicesViewProps) {
    const [decision, setDecision] = React.useState<Decision | null>(null);
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const nameOf = React.useMemo(() => {
        const byId = new Map(publishers.map((publisher) => [publisher.id, publisher.name]));
        return (id: string) => byId.get(id) ?? shortId(id, "PUB-");
    }, [publishers]);

    const allCount = PUBLISHER_INVOICE_STATUSES.reduce(
        (sum, value) => sum + (page.counts[value] ?? 0),
        0
    );

    function open(row: PublisherInvoice, next: "MATCHED" | "REJECTED") {
        setDecision({ row, status: next });
        setNote("");
    }

    async function confirm() {
        if (!decision) return;
        const text = note.trim();
        if (decision.status === "REJECTED" && !text) {
            toast.error("Say why the invoice is rejected — the publisher reads it before re-uploading.");
            return;
        }
        setBusy(true);
        try {
            await invoicesService.reviewPublisherInvoice(decision.row.id, {
                status: decision.status,
                ...(text ? { note: text } : {}),
            });
            toast.success(
                decision.status === "MATCHED"
                    ? `${periodLabel(decision.row.period)} invoice from ${nameOf(decision.row.publisherId)} matched`
                    : `${periodLabel(decision.row.period)} invoice from ${nameOf(decision.row.publisherId)} rejected`
            );
            setDecision(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record that decision.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title="Publisher invoices"
                subtitle="Invoices GST-registered publishers raised on ADX for a month's earnings. Match one against the statement so ADX can claim the input credit."
            />

            <FilterChips<PublisherInvoiceStatus | "ALL">
                value={status}
                onChange={onStatusChange}
                chips={[
                    { value: "ALL", label: "All", count: allCount },
                    ...PUBLISHER_INVOICE_STATUSES.map((value) => ({
                        value,
                        label: PUBLISHER_INVOICE_STATUS_META[value].label,
                        count: page.counts[value] ?? 0,
                    })),
                ]}
            />

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                {page.items.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-4 py-2.5 font-medium">Publisher</th>
                                    <th className="px-4 py-2.5 font-medium">Period</th>
                                    <th className="px-4 py-2.5 font-medium">GSTIN</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                                    <th className="px-4 py-2.5 font-medium">Uploaded</th>
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                    <th className="px-4 py-2.5 font-medium">File</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Decision</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.items.map((row) => (
                                    <tr key={row.id} className="border-b align-top last:border-0">
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/publishers/${row.publisherId}`}
                                                className="font-medium text-foreground hover:underline"
                                            >
                                                {nameOf(row.publisherId)}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">{periodLabel(row.period)}</td>
                                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                            {row.gstin ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                                            {formatMoney(row.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {formatDateTime(row.createdAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={PUBLISHER_INVOICE_STATUS_META[row.status]} />
                                            {row.note && (
                                                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                                    {row.note}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {row.fileUrl ? (
                                                <a
                                                    href={row.fileUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 text-foreground hover:underline"
                                                >
                                                    Open
                                                    <ExternalLink className="size-3.5" aria-hidden />
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground">No file</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {row.status === "UPLOADED" ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" onClick={() => open(row, "MATCHED")}>
                                                        Match
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => open(row, "REJECTED")}
                                                    >
                                                        Reject
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    {row.reviewedAt ? formatDateTime(row.reviewedAt) : "Decided"}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                        {status === "UPLOADED"
                            ? "Nothing waiting. A publisher's upload lands here the moment it is made."
                            : "No publisher invoices in this state."}
                    </p>
                )}
            </Card>

            <ConfirmDialog
                open={decision !== null}
                onOpenChange={(next) => !next && setDecision(null)}
                title={
                    decision?.status === "MATCHED" ? "Match this invoice?" : "Reject this invoice?"
                }
                description={
                    decision?.status === "MATCHED"
                        ? `${formatMoney(decision.row.amount)} for ${periodLabel(decision.row.period)} from ${nameOf(decision.row.publisherId)}. Matching says it agrees with the month's statement and ADX will claim the credit against it.`
                        : decision
                          ? `${formatMoney(decision.row.amount)} for ${periodLabel(decision.row.period)} from ${nameOf(decision.row.publisherId)}. The publisher sees the note and replaces the file in place.`
                          : ""
                }
                confirmLabel={decision?.status === "MATCHED" ? "Match" : "Reject"}
                destructive={decision?.status === "REJECTED"}
                busy={busy}
                disabled={decision?.status === "REJECTED" && !note.trim()}
                onConfirm={confirm}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="publisher-invoice-note">
                        {decision?.status === "MATCHED" ? "Note (optional)" : "Reason"}
                    </Label>
                    <Textarea
                        id="publisher-invoice-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        maxLength={400}
                        placeholder={
                            decision?.status === "MATCHED"
                                ? "Anything the next person should know."
                                : "What does not agree — the amount, the GSTIN, the period."
                        }
                    />
                </div>
            </ConfirmDialog>
        </div>
    );
}
