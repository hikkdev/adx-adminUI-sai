"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, Download, FileX2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import {
    INVOICE_KIND_META,
    INVOICE_STATUS_META,
    LINE_KIND_LABEL,
    canVoid,
    formatGstPct,
    formatQuantity,
    invoicesService,
    type InvoiceDetail as Invoice,
} from "@/services/invoices";
import { shortId } from "@/services/finance";
import { InvoiceTotals } from "./invoice-totals";

interface InvoiceDetailProps {
    invoice: Invoice;
    /** Re-read after a void: the row is VOID now and a credit note exists. */
    onChanged: () => void;
}

/**
 * One document, laid out the way the PDF prints it: who issued it, who it
 * was issued to, the number and dates, the lines with their SAC and GST, the
 * totals, and what it was for.
 *
 * Two actions, both real. Download fetches the PDF with the bearer token and
 * hands it to the browser. Void issues a credit note and marks this VOID in
 * one transaction — the dialog says so, because "void" reads as "delete" to
 * anyone who has not read the GST rules, and nothing here is ever deleted.
 * Voiding moves no money: after capture the refund is the desk's.
 */
export function InvoiceDetail({ invoice, onChanged }: InvoiceDetailProps) {
    const { can } = useAuth();
    const [downloading, setDownloading] = React.useState(false);
    const [voiding, setVoiding] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const isCreditNote = invoice.kind === "CREDIT_NOTE";
    const mayVoid = canVoid(invoice);
    const allowed = can("finance.approve");

    async function download() {
        setDownloading(true);
        try {
            const { filename } = await invoicesService.downloadPdf(invoice);
            toast.success(`Downloaded ${filename}`);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not download the PDF.");
        } finally {
            setDownloading(false);
        }
    }

    async function confirmVoid() {
        const text = reason.trim();
        if (text.length < 3) {
            toast.error("Say why the invoice is being voided — it is printed on the credit note.");
            return;
        }
        setBusy(true);
        try {
            const result = await invoicesService.void(invoice.id, text);
            toast.success(`${invoice.number} voided`, {
                description: `Credit note ${result.creditNote.number} issued for ${formatMoney(
                    result.creditNote.total.replace(/^-/, "")
                )}. No money moved.`,
            });
            setVoiding(false);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not void the invoice.");
        } finally {
            setBusy(false);
        }
    }

    const lines = [...invoice.lines].sort((a, b) => a.sortOrder - b.sortOrder);

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/finance/invoices"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Invoices
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                                {invoice.number}
                            </h1>
                            <StatusBadge status={INVOICE_KIND_META[invoice.kind]} />
                            <StatusBadge status={INVOICE_STATUS_META[invoice.status]} />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {[
                                invoice.recipientName,
                                invoice.issuedAt ? `Issued ${formatDate(invoice.issuedAt)}` : "Not issued",
                                invoice.dueAt ? `Due ${formatDate(invoice.dueAt)}` : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" className="bg-card" disabled={downloading} onClick={download}>
                            <Download className="mr-1.5 size-4" aria-hidden />
                            {downloading ? "Fetching…" : "Download PDF"}
                        </Button>
                        {mayVoid && allowed && (
                            <Button variant="destructive" onClick={() => setVoiding(true)}>
                                <FileX2 className="mr-1.5 size-4" aria-hidden />
                                Void
                            </Button>
                        )}
                    </div>
                </div>
                {mayVoid && !allowed && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Voiding needs the finance.approve permission.
                    </p>
                )}
            </div>

            {invoice.status === "VOID" && (
                <Card className="rounded-lg border-danger/40 bg-danger-soft p-3 shadow-none">
                    <p className="text-sm text-foreground">
                        This invoice is void. A credit note was issued against it; find it in the register
                        under Credit note. The document itself is unchanged, as an issued document must be.
                    </p>
                </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title="Supplier" description="ADX, as the legal entity read when this was issued.">
                    <FieldList
                        items={[
                            ["Name", invoice.supplierName ?? "—"],
                            ["GSTIN", invoice.supplierGstin ?? "Not registered"],
                            ["State code", invoice.supplierStateCode ?? "—"],
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Recipient" description="The advertiser billed.">
                    <FieldList
                        items={[
                            [
                                "Name",
                                <Link
                                    key="advertiser"
                                    href={`/advertisers/${invoice.advertiserId}`}
                                    className="hover:underline"
                                >
                                    {invoice.recipientName}
                                </Link>,
                            ],
                            ["GSTIN", invoice.recipientGstin ?? "Unregistered"],
                            ["State code", invoice.recipientStateCode ?? "—"],
                            ["Address", invoice.recipientAddress ?? "—"],
                        ]}
                    />
                </SectionCard>
                <SectionCard title="Document" description="What this invoice describes.">
                    <FieldList
                        items={[
                            ["Place of supply", invoice.placeOfSupply ?? "—"],
                            ["Issued", invoice.issuedAt ? formatDate(invoice.issuedAt) : "—"],
                            ["Due", invoice.dueAt ? formatDate(invoice.dueAt) : "On issue"],
                            ...(invoice.campaignId
                                ? [
                                      [
                                          "Campaign",
                                          <Link
                                              key="campaign"
                                              href={`/campaigns/${invoice.campaignId}`}
                                              className="hover:underline"
                                          >
                                              {shortId(invoice.campaignId, "CMP-")}
                                          </Link>,
                                      ] as [string, React.ReactNode],
                                  ]
                                : []),
                            ...(invoice.packageSaleId
                                ? [
                                      [
                                          "Package sale",
                                          <Link key="sale" href="/packages/sales" className="hover:underline">
                                              {shortId(invoice.packageSaleId, "PKG-")}
                                          </Link>,
                                      ] as [string, React.ReactNode],
                                  ]
                                : []),
                            ...(invoice.voidsInvoiceId
                                ? [
                                      [
                                          "Against invoice",
                                          <Link
                                              key="against"
                                              href={`/finance/invoices/${invoice.voidsInvoiceId}`}
                                              className="hover:underline"
                                          >
                                              Open the voided invoice
                                          </Link>,
                                      ] as [string, React.ReactNode],
                                  ]
                                : []),
                            ...(invoice.paymentId
                                ? [["Payment", invoice.paymentId] as [string, React.ReactNode]]
                                : []),
                            ...(invoice.topUpId
                                ? [["Top-up", invoice.topUpId] as [string, React.ReactNode]]
                                : []),
                        ]}
                    />
                </SectionCard>
            </div>

            <SectionCard
                title="Lines"
                description={
                    isCreditNote
                        ? "The mirror image of the original, so the advertiser's documents net to what was billed. The reason travels as the zero-value line."
                        : "Read off the booking as it was authorised; the amounts are the quote's, so the invoice cannot disagree with what was held."
                }
                contentClassName="p-0"
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-2.5 font-medium">Description</th>
                                <th className="px-4 py-2.5 font-medium">SAC</th>
                                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                                <th className="px-4 py-2.5 text-right font-medium">Taxable</th>
                                <th className="px-4 py-2.5 text-right font-medium">GST %</th>
                                <th className="px-4 py-2.5 text-right font-medium">GST</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line) => (
                                <tr key={line.id} className="border-b last:border-0">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-foreground">{line.description}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {LINE_KIND_LABEL[line.kind]}
                                            {line.campaignSpotId ? ` · spot ${shortId(line.campaignSpotId)}` : ""}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                        {line.sacCode ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        {formatQuantity(line.quantity)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        {formatMoney(line.unitRate)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        {formatMoney(line.taxableValue)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                                        {formatGstPct(line.gstPct)}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        {formatMoney(line.gstAmount)}
                                    </td>
                                </tr>
                            ))}
                            {lines.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                                        This document has no lines.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-start-3">
                    <SectionCard title="Totals">
                        <InvoiceTotals invoice={invoice} />
                    </SectionCard>
                </div>
            </div>

            <ConfirmDialog
                open={voiding}
                onOpenChange={(next) => !next && setVoiding(false)}
                title={`Void ${invoice.number}?`}
                description="An issued document is never deleted. Voiding issues a credit note for the full amount against this invoice and marks it void, in one transaction. No money moves — after capture the refund is a separate step on the refunds desk."
                confirmLabel="Void and issue credit note"
                destructive
                busy={busy}
                disabled={reason.trim().length < 3}
                onConfirm={confirmVoid}
            >
                <div className="space-y-1.5">
                    <Label htmlFor="void-reason">Reason</Label>
                    <Textarea
                        id="void-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        maxLength={400}
                        placeholder="Printed on the credit note, so the advertiser reads it too."
                    />
                </div>
            </ConfirmDialog>
        </div>
    );
}
