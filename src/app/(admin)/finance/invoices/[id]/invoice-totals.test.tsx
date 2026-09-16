import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvoiceTotals } from "./invoice-totals";

/**
 * The totals block prints what the backend decided and nothing it did not.
 *
 * CGST + SGST or IGST — never both, and never a ₹0.00 row for the split that
 * does not apply. The round-off is always drawn, zero included, so a reader
 * can check `taxable + gst + roundOff = total` without wondering whether a
 * line was hidden. Every figure comes from the decimal string, paise intact.
 */

const base = {
    kind: "TAX_INVOICE" as const,
    taxableValue: "10000.00",
    roundOff: "0.00",
};

describe("<InvoiceTotals>", () => {
    it("draws CGST and SGST, and no IGST row, for an in-state supply", () => {
        render(
            <InvoiceTotals
                invoice={{ ...base, cgst: "900.00", sgst: "900.00", igst: "0.00", total: "11800.00" }}
            />
        );
        expect(screen.getByText("Taxable value").nextSibling).toHaveTextContent("₹10,000.00");
        expect(screen.getByText("CGST").nextSibling).toHaveTextContent("₹900.00");
        expect(screen.getByText("SGST").nextSibling).toHaveTextContent("₹900.00");
        expect(screen.queryByText("IGST")).toBeNull();
        expect(screen.getByText("Total").nextSibling).toHaveTextContent("₹11,800.00");
    });

    it("draws IGST alone for an inter-state supply", () => {
        render(
            <InvoiceTotals
                invoice={{ ...base, cgst: "0.00", sgst: "0.00", igst: "1800.00", total: "11800.00" }}
            />
        );
        expect(screen.getByText("IGST").nextSibling).toHaveTextContent("₹1,800.00");
        expect(screen.queryByText("CGST")).toBeNull();
        expect(screen.queryByText("SGST")).toBeNull();
    });

    it("always shows the round-off, with a paisa it keeps and a zero it does not hide", () => {
        const { rerender } = render(
            <InvoiceTotals
                invoice={{
                    ...base,
                    taxableValue: "1234.57",
                    cgst: "111.11",
                    sgst: "111.12",
                    igst: "0.00",
                    roundOff: "0.20",
                    total: "1457.00",
                }}
            />
        );
        expect(screen.getByText("Round-off").nextSibling).toHaveTextContent("₹0.20");
        expect(screen.getByText("SGST").nextSibling).toHaveTextContent("₹111.12");
        expect(screen.getByText("Total").nextSibling).toHaveTextContent("₹1,457.00");

        rerender(
            <InvoiceTotals
                invoice={{ ...base, cgst: "900.00", sgst: "900.00", igst: "0.00", total: "11800.00" }}
            />
        );
        expect(screen.getByText("Round-off").nextSibling).toHaveTextContent("₹0.00");
    });

    it("prints a credit note's negative figures as negative, and names the total as the note's", () => {
        render(
            <InvoiceTotals
                invoice={{
                    kind: "CREDIT_NOTE",
                    taxableValue: "-10000.00",
                    cgst: "0.00",
                    sgst: "0.00",
                    igst: "-1800.00",
                    roundOff: "-0.00",
                    total: "-11800.00",
                }}
            />
        );
        expect(screen.getByText("IGST").nextSibling).toHaveTextContent("-₹1,800.00");
        expect(screen.getByText("Credit note total").nextSibling).toHaveTextContent("-₹11,800.00");
    });
});
