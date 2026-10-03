import type { LedgerTransactionKind } from "@/services/finance";

/** The filter bar as it is typed — the search and the amount settle before they are sent. */
export interface LedgerFilters {
    q: string;
    walletId: string;
    kind: LedgerTransactionKind[];
    from: string;
    to: string;
    amount: string;
}

export const EMPTY_LEDGER_FILTERS: LedgerFilters = { q: "", walletId: "", kind: [], from: "", to: "", amount: "" };

export const LEDGER_PAGE_SIZES = [20, 50, 100] as const;

/** A whole-rupee or two-decimal figure — anything else is not sent rather than refused. */
export const LEDGER_AMOUNT = /^\d+(\.\d{1,2})?$/;

export const ledgerFiltersActive = (filters: LedgerFilters): boolean =>
    Boolean(filters.q.trim() || filters.walletId || filters.kind.length || filters.from || filters.to || filters.amount.trim());
