import { formatMoney, isZeroMoney } from "@/lib/format";
import { taxSplitOf, type InvoiceRow } from "@/services/invoices";

type Totals = Pick<InvoiceRow, "taxableValue" | "cgst" | "sgst" | "igst" | "roundOff" | "total" | "kind">;

/**
 * The totals block as the PDF prints it: taxable value, the GST split one
 * way or the other, the round-off, the total.
 *
 * CGST + SGST or IGST — never both, and never a zero row for the one that
 * does not apply. The backend decides the split from the supplier's state
 * against the recipient's and the table's CHECK enforces one-or-the-other,
 * so the page shows what was decided rather than every column the row has.
 *
 * The round-off is always drawn, zero included: it is the line that makes
 * `Σ taxable + Σ gst + roundOff = total` hold to the paisa, and a reader
 * checking the arithmetic should not have to wonder whether it was hidden.
 * A credit note's figures arrive negative and are printed that way.
 */
export function InvoiceTotals({ invoice }: { invoice: Totals }) {
    const split = taxSplitOf(invoice);
    const rows: [string, string][] = [["Taxable value", formatMoney(invoice.taxableValue)]];
    if (split === "INTRA_STATE") {
        rows.push(["CGST", formatMoney(invoice.cgst)], ["SGST", formatMoney(invoice.sgst)]);
    } else {
        rows.push(["IGST", formatMoney(invoice.igst)]);
    }
    rows.push(["Round-off", isZeroMoney(invoice.roundOff) ? "₹0.00" : formatMoney(invoice.roundOff)]);

    return (
        <dl className="space-y-2 text-sm" data-tax-split={split}>
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums text-foreground">{value}</dd>
                </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t pt-2">
                <dt className="font-semibold text-foreground">
                    {invoice.kind === "CREDIT_NOTE" ? "Credit note total" : "Total"}
                </dt>
                <dd className="text-base font-semibold tabular-nums text-foreground">
                    {formatMoney(invoice.total)}
                </dd>
            </div>
        </dl>
    );
}
