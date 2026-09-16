import { ApiError, api as http, attachmentFilename, saveBlob } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { sumMoney } from "@/lib/format";
import type { StatusMeta } from "@/types";
import type { ListPage } from "./users";

export type { ListPage };

/**
 * Wallets, the ledger and the payout queue, wired to the backend `payouts`
 * module's admin router at `/finance`.
 *
 * Same shape as `supplyService` and `orderService` — one function per endpoint,
 * identical return types — with one deliberate difference: there is no fixture
 * fallback anywhere in this file. Every number here is somebody's money. A
 * seeded balance beside a real one is indistinguishable on screen, and the
 * whole point of a finance console is that what it shows is what the books say.
 * With the API off these screens say so instead of improvising, exactly as the
 * pricing engine and the commission screens already do.
 *
 * MONEY IS A DECIMAL STRING END TO END. The backend serialises every rupee
 * figure through its `money()` helper as `"12500.00"`, and nothing in this file
 * or the screens above it turns one into a `number`. Use `formatMoney`,
 * `sumMoney` and `compareMoney` from `@/lib/format` — they count paise as
 * bigints and never build a float.
 */

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

/** A rupee amount exactly as the API sends it. Never parsed, never re-rendered. */
export type Money = string;

/** An ISO timestamp. Prisma dates arrive as strings over JSON. */
export type Timestamp = string;

/** Lot B (B4b) added the fourth owner: a print partner's sign-in-disabled payee wallet. */
export type WalletKind = "PUBLISHER" | "AGENT" | "ADVERTISER" | "PRINT_PARTNER";
/** The owner of a withdrawal, as `partyOfWithdrawal` resolves it: the same four kinds a wallet has. */
export type PayoutPartyKind = WalletKind;
export type PartySizeBand = "INDIVIDUAL" | "SMALL_AGENCY" | "LARGE_AGENCY";

export type WithdrawalStatus =
    | "REQUESTED"
    | "APPROVED"
    | "PROCESSING"
    | "PAID"
    | "REJECTED"
    | "FAILED"
    | "CANCELLED";

export type PayoutMethodStatus = "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type PayoutVerificationMethod = "PENNY_DROP" | "NAME_LOOKUP" | "MANUAL";
export type PayoutRailName = "MANUAL_NEFT" | "RAZORPAY_X" | "CASHFREE";

export type IncentiveStatus = "PENDING_VERIFICATION" | "CREDITED" | "REJECTED";
export type IncentiveEvent =
    | "PUBLISHER_ONBOARDED"
    | "SITE_VISIT"
    | "CAMPAIGN_ASSIST"
    | "MILESTONE_BONUS"
    | "TIER_BONUS"
    | "PACKAGE_SOLD"
    | "INSTALLATION"
    | "ADVERTISER_ONBOARDED";

/** Every value of the backend's `IncentiveEvent` enum, in the order the rates screen lists them. */
export const INCENTIVE_EVENTS: readonly IncentiveEvent[] = [
    "PUBLISHER_ONBOARDED",
    "ADVERTISER_ONBOARDED",
    "INSTALLATION",
    "SITE_VISIT",
    "CAMPAIGN_ASSIST",
    "PACKAGE_SOLD",
    "MILESTONE_BONUS",
    "TIER_BONUS",
];

/** Lot B: PARTNER is the print shop, withheld under 194C at cost approval. */
export type TaxParty = "PUBLISHER" | "AGENT" | "PARTNER";

export type LedgerTransactionKind =
    | "TOPUP"
    | "CAMPAIGN_SPEND"
    | "PACKAGE_SPEND"
    | "PUBLISHER_EARNING"
    | "AGENT_INCENTIVE"
    | "PAYOUT"
    | "REFUND"
    | "GOODWILL"
    | "PENALTY"
    | "ADJUSTMENT"
    | "EXPIRY"
    /** Lot B (B4b): a print partner's approved cost, posted into their payee wallet. */
    | "PRINT_COST"
    | "REVERSAL";

/** One row of `GET /finance/wallets`. */
export interface WalletRow {
    id: string;
    kind: WalletKind;
    /** The publisher's name, the advertiser's company — or the literal "Agent",
     *  which is what the endpoint answers because an agent wallet joins no name. */
    owner: string;
    displayId: string | null;
    sizeBand: PartySizeBand | null;
    balance: Money;
    goodwill: Money;
    lastActivityAt: Timestamp | null;
}

/**
 * The derived figures behind a wallet. Every one is computed from the entries
 * rather than stored, so they cannot drift from the statement below them.
 */
export interface WalletSnapshot {
    walletId: string;
    /** Settled money: credits less debits. */
    balance: Money;
    /** Credit that can be spent on ADX and never withdrawn. */
    goodwill: Money;
    /** Spendable on the platform: balance plus goodwill, less what is held. */
    spendable: Money;
    /** Earned and credited, still inside its seven-day clearing window. */
    pendingClearance: Money;
    /** Reserved against a booking. */
    held: Money;
    /** Already asked for and not yet resolved. */
    openWithdrawals: Money;
    /** balance − pendingClearance − held − openWithdrawals, never negative. */
    withdrawable: Money;
    lastActivityAt: Timestamp | null;
    /** Lot A: set while FREEZE_WALLET is on the party. Money lands; nothing leaves. */
    frozenAt: Timestamp | null;
    frozenReason: string | null;
}

/** Who the wallet belongs to, as `partyContext` resolves it. */
export interface PartyContext {
    kind: WalletKind;
    entityId: string;
    walletId: string;
    userId: string;
    name: string;
    onboardedAt: Timestamp;
    sizeBand: PartySizeBand;
    tier: string | null;
}

/**
 * What this party may take out today, and why that is the number.
 *
 * The cap is tiered by band and by tenure, so the allowance carries the rung
 * they are on, what is left of it today, and the rung above — a screen that
 * shows only the ceiling cannot answer "why is it that?".
 */
export interface Allowance {
    walletId: string;
    party: { kind: WalletKind; name: string; sizeBand: PartySizeBand };
    balance: Money;
    pendingClearance: Money;
    openWithdrawals: Money;
    withdrawable: Money;
    dailyCap: Money;
    usedToday: Money;
    remainingToday: Money;
    /** The most that may be asked for right now: cleared funds capped by the day. */
    maximum: Money;
    minimum: Money;
    monthsOnPlatform: number;
    nextRung: { months: number; cap: Money } | null;
}

export interface WalletEntry {
    id: string;
    type: string;
    amount: Money;
    balanceAfter: Money;
    isGoodwill: boolean;
    reference: string | null;
    note: string | null;
    createdAt: Timestamp;
}

export interface PayoutMethod {
    id: string;
    type: "BANK" | "UPI";
    accountHolder: string | null;
    bankName: string | null;
    /** Masked server-side: "•••• 4417". The full number never leaves the backend. */
    accountNumberMasked: string | null;
    ifscCode: string | null;
    upiVpa: string | null;
    isDefault: boolean;
    status: PayoutMethodStatus;
    verifiedVia: PayoutVerificationMethod | null;
    verifiedAt: Timestamp | null;
    nameMatchPct: Money | null;
    rejectionReason: string | null;
    createdAt: Timestamp;
}

/** What ops types for a method recorded on a party's behalf (D5). */
export interface NewPayoutMethodInput {
    type: "BANK" | "UPI";
    accountHolder?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiVpa?: string;
}

export interface Withdrawal {
    id: string;
    /** Readable, e.g. WDR-2026-000118. */
    reference: string;
    walletId: string;
    /** Lot B (Q140): from the wallet's owner — the queue's filter and the batch line's type. */
    partyKind: PayoutPartyKind;
    partyName: string;
    amount: Money;
    /** Zero, and by design: TDS was withheld when the income was credited. */
    taxWithheld: Money;
    netAmount: Money;
    status: WithdrawalStatus;
    requestedAt: Timestamp;
    decidedAt: Timestamp | null;
    decisionNote: string | null;
    /** Set at approval: the amount is reserved in the wallet, not yet debited. */
    reservedAt: Timestamp | null;
    /** The payout batch this line belongs to, once one has claimed it. */
    batchId: string | null;
    rail: PayoutRailName | null;
    /** The UTR, once finance has made the transfer. */
    railReference: string | null;
    paidAt: Timestamp | null;
    failureReason: string | null;
    method: PayoutMethod;
}

/** `GET /finance/wallets/:id` — the snapshot, plus everything around it. */
export interface WalletDetail extends WalletSnapshot {
    party: PartyContext | null;
    /** Null when the wallet has no party to hang a ladder on. */
    allowance: Allowance | null;
    withdrawals: Withdrawal[];
}

export interface Incentive {
    id: string;
    agentId: string;
    /** E6: the party the work was for, when the event names one — the row links into their page. */
    publisherId: string | null;
    advertiserId: string | null;
    event: IncentiveEvent;
    tier: string;
    amount: Money;
    taxWithheld: Money;
    netAmount: Money;
    status: IncentiveStatus;
    orderId: string | null;
    note: string | null;
    verifiedAt: Timestamp | null;
    rejectionReason: string | null;
    createdAt: Timestamp;
}

export interface WithdrawalLimit {
    id: string;
    band: PartySizeBand;
    /** Months on the platform this rung starts at. */
    minMonths: number;
    dailyCap: Money;
}

export interface TaxRate {
    id: string;
    appliesTo: TaxParty;
    /** The section of the Income Tax Act being applied, e.g. 194C. */
    section: string;
    ratePct: Money;
    effectiveFrom: Timestamp;
    effectiveTo: Timestamp | null;
    note: string | null;
}

export interface IncentiveRate {
    id: string;
    event: IncentiveEvent;
    /** A tier name, or "*" for every tier. */
    tier: string;
    amount: Money;
    effectiveFrom: Timestamp;
    effectiveTo: Timestamp | null;
}

export interface LedgerLeg {
    accountCode: string;
    accountName: string;
    /** Signed from the account's point of view. The legs of a transaction sum to zero. */
    amount: Money;
    note: string | null;
}

export interface LedgerTransaction {
    id: string;
    reference: string;
    kind: LedgerTransactionKind;
    occurredAt: Timestamp;
    note: string | null;
    /** Set on a REVERSAL: the transaction it mirrors. */
    reversesId: string | null;
    legs: LedgerLeg[];
}

/** `GET /finance/ledger/verify` — the books checking themselves. */
export interface LedgerHealth {
    /** Transactions whose legs do not sum to zero. */
    unbalanced: { transactionId: string; total: Money }[];
    /** Wallets whose balance disagrees with their ledger account. */
    drift: { walletId: string; walletTotal: Money; ledgerTotal: Money }[];
    healthy: boolean;
}

export interface AccrualRun {
    spotsConsidered: number;
    daysCredited: number;
    totalNet: Money;
    skipped: number;
}

export interface RailStatus {
    name: PayoutRailName;
    /** False when the vendor has no credentials, so payments fall back to manual. */
    configured: boolean;
    pennyDrop: boolean;
}

/* ---------------- Lot B (Q140): the queue's header ---------------- */

/** `GET /finance/withdrawals/summary` — rows per status, and how many the rail has held over a day. */
export interface WithdrawalSummary {
    counts: Record<WithdrawalStatus, number>;
    /** PROCESSING rows untouched for more than 24 hours: a transfer somebody should chase. */
    processingOver24h: number;
    /** E6: gross of REQUESTED + APPROVED — what the wallets are holding back. */
    reservedTotal: Money;
    /** E6: net of PROCESSING — what the rail is carrying right now. */
    processingTotal: Money;
    /** E6: net PAID inside the current IST calendar month. */
    paidThisMonth: Money;
}

/** The queue's facets, all optional; `status` is a comma list on the wire. */
export interface WithdrawalFilter {
    status?: WithdrawalStatus[];
    /** Reference, UTR or party name, contains, case-insensitive. */
    q?: string;
    partyKind?: PayoutPartyKind;
    /** Requested-at window, ISO. */
    from?: string;
    to?: string;
    batchId?: string;
    /** E6: the profile behind the wallet — a party page's Payouts tab. */
    publisherId?: string;
    agentId?: string;
    walletId?: string;
    limit?: number;
}

/* ---------------- Lot B (Q85/Q140): payout batches ---------------- */

export type PayoutBatchStatus =
    | "DRAFT"
    | "IN_REVIEW"
    | "APPROVED"
    | "RELEASING"
    | "RELEASED"
    | "COMPLETED"
    | "PARTIALLY_FAILED"
    | "FAILED"
    | "CANCELLED";

/** Every value of the backend's `PayoutBatchStatus`, in ladder order. */
export const PAYOUT_BATCH_STATUSES: readonly PayoutBatchStatus[] = [
    "DRAFT",
    "IN_REVIEW",
    "APPROVED",
    "RELEASING",
    "RELEASED",
    "COMPLETED",
    "PARTIALLY_FAILED",
    "FAILED",
    "CANCELLED",
];

/** One row of `GET /finance/payout-batches`, and the head of the detail. */
export interface PayoutBatch {
    id: string;
    /** BATCH-<year>-<n>. */
    reference: string;
    status: PayoutBatchStatus;
    rail: PayoutRailName;
    bankAccountId: string | null;
    cutoffAt: Timestamp | null;
    scheduledFor: Timestamp | null;
    createdByUserId: string;
    /** E6: the builder, joined — `name` null for an admin the platform no longer has. */
    createdBy: { id: string; name: string | null } | null;
    submittedAt: Timestamp | null;
    /** The second admin — never the one who built it. */
    approvedByUserId: string | null;
    approvedBy: { id: string; name: string | null } | null;
    approvedAt: Timestamp | null;
    releasedAt: Timestamp | null;
    completedAt: Timestamp | null;
    lineCount: number;
    totalNet: Money;
    /** The bank bulk-transfer file, stored at release on the manual rail. */
    exportFileId: string | null;
    note: string | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/** An ADX bank account — what a batch is drawn on and a statement is imported for. Masked at rest. */
export interface BankAccount {
    id: string;
    label: string;
    bankName: string;
    accountHolder: string | null;
    /** "•••• 1234": the whole number was never stored. */
    accountNumberMasked: string | null;
    ifsc: string;
    isActive: boolean;
    isDefault: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

/** `PUT /finance/bank-accounts`: with `id` an update, without one a create. */
export interface BankAccountInput {
    id?: string;
    label: string;
    bankName: string;
    accountHolder?: string;
    /** The whole number, on the way in only. */
    accountNumber?: string;
    ifsc: string;
    isActive?: boolean;
    isDefault?: boolean;
}

/** `GET /finance/payout-batches/:id` — the batch, its account and its lines. */
export interface PayoutBatchDetail extends PayoutBatch {
    bankAccount: BankAccount | null;
    lines: Withdrawal[];
}

export interface NewPayoutBatchInput {
    rail?: PayoutRailName;
    bankAccountId?: string;
    note?: string;
    scheduledFor?: string;
    cutoffAt?: string;
}

/** The codes `preflightLine` can name, and what each one means on screen. */
export type LinePreflightProblem =
    | "METHOD_NOT_VERIFIED"
    | "WALLET_MISSING"
    | "KYC_NOT_VERIFIED"
    | "USER_INACTIVE"
    | "PARTNER_INACTIVE"
    | "WALLET_SHORT"
    | "WALLET_FROZEN";

export interface LinePreflight {
    withdrawalId: string;
    reference: string;
    netAmount: Money;
    /** Empty when the line will release. `NOT_APPROVED:<status>` is the one code with a suffix. */
    problems: string[];
}

/** `GET /finance/payout-batches/:id/preflight` — everything release will refuse on, in one read. */
export interface BatchPreflight {
    ok: boolean;
    rail: { name: PayoutRailName; configured: boolean };
    ledgerHealthy: boolean;
    lines: LinePreflight[];
}

/** `POST /finance/payout-batches/:id/release` — the batch, plus the tally. */
export interface ReleaseOutcome extends PayoutBatchDetail {
    released: number;
    failed: number;
    skipped: number;
}

export interface PayoutBatchFilter {
    status?: PayoutBatchStatus[];
    q?: string;
    page?: number;
    pageSize?: number;
}

/** G13-B: the export's query — the desk's status and search, no page (the server walks every page itself). */
export function payoutBatchesExportQuery(filter: Pick<PayoutBatchFilter, "status" | "q"> = {}): string {
    return query({
        status: filter.status?.length ? filter.status.join(",") : undefined,
        q: filter.q?.trim() || undefined,
    });
}

/** `payout-batches-2026-09-14.csv` when the server named nothing. */
export const payoutBatchesExportFilename = (now = new Date()): string => `payout-batches-${now.toISOString().slice(0, 10)}.csv`;

/* ---------------- Lot B (Q85): reconciliation ---------------- */

export type BankLineDirection = "CREDIT" | "DEBIT";
export type BankLineMatchStatus = "UNMATCHED" | "MATCHED" | "DIFFERS" | "IGNORED";

export const BANK_LINE_STATUSES: readonly BankLineMatchStatus[] = ["UNMATCHED", "MATCHED", "DIFFERS", "IGNORED"];

/** How a bank's CSV names its columns. */
export interface StatementColumns {
    date: string;
    description: string;
    utr?: string;
    debit?: string;
    credit?: string;
    amount?: string;
    balance?: string;
}

export interface StatementProfile {
    id: string;
    name: string;
    bankName: string;
    columns: StatementColumns;
    /** `dd/MM/yyyy` and the like; null means the default. */
    dateFormat: string | null;
    createdAt: Timestamp;
}

export interface NewStatementProfileInput {
    name: string;
    bankName: string;
    columns: StatementColumns;
    dateFormat?: string;
}

export interface StatementImport {
    id: string;
    bankAccountId: string;
    profileId: string | null;
    fileId: string | null;
    fileName: string;
    periodStart: Timestamp | null;
    periodEnd: Timestamp | null;
    lineCount: number;
    duplicateCount: number;
    importedByUserId: string;
    createdAt: Timestamp;
}

/** `POST /finance/reconciliation/imports` — what landed, what was already there, what could not be read. */
export interface StatementImportOutcome {
    import: StatementImport;
    created: number;
    duplicates: number;
    /** Rows the parser could not read, by record number; the good rows still landed. */
    problems: { row: number; problem: string }[];
}

/** The one ADX record that explains a bank line. */
export interface ReconciliationMatch {
    id: string;
    withdrawalId: string | null;
    topUpId: string | null;
    paymentId: string | null;
    ledgerTransactionId: string | null;
    /** Line minus record. Zero when they agree. */
    difference: Money;
    kind: "AUTO" | "MANUAL";
    matchedByUserId: string | null;
    note: string | null;
    createdAt: Timestamp;
}

export interface BankStatementLine {
    id: string;
    importId: string;
    bankAccountId: string;
    valueDate: Timestamp;
    description: string;
    utr: string | null;
    direction: BankLineDirection;
    amount: Money;
    runningBalance: Money | null;
    matchStatus: BankLineMatchStatus;
    match: ReconciliationMatch | null;
    createdAt: Timestamp;
}

export interface BankLineFilter {
    status?: BankLineMatchStatus[];
    bankAccountId?: string;
    importId?: string;
    /** Value-date window, ISO. */
    from?: string;
    to?: string;
    q?: string;
    page?: number;
    pageSize?: number;
}

/** `POST /finance/reconciliation/lines/:id/match` — exactly one of the four ids. */
export type MatchTarget =
    | { withdrawalId: string }
    | { topUpId: string }
    | { paymentId: string }
    | { ledgerTransactionId: string };

export interface AutoMatchOutcome {
    scanned: number;
    matched: number;
    differs: number;
    unmatched: number;
    /** Lines whose withdrawal the bank has paid but finance has not yet confirmed. */
    awaitingMarkPaid: { lineId: string; withdrawalId: string; reference: string; utr: string | null }[];
}

/** `GET /finance/reconciliation/summary` — count and sum per status, and the total. */
export type ReconciliationSummary = Record<BankLineMatchStatus, { count: number; sum: Money }> & {
    total: { count: number; sum: Money };
};

export interface ReconciliationWindow {
    bankAccountId?: string;
    from?: string;
    to?: string;
}

/**
 * Lot G (Q125): the filters `GET /finance/reconciliation/lines/export.csv`
 * takes — the desk's own, with no page: the file is every line they match,
 * newest value date first, 50,000 at most. Pure so the test can pin that a
 * blank facet is left off and a page number never travels.
 */
export function reconciliationExportQuery(filter: Omit<BankLineFilter, "page" | "pageSize"> = {}): string {
    return query({
        status: filter.status?.length ? filter.status.join(",") : undefined,
        bankAccountId: filter.bankAccountId,
        importId: filter.importId,
        from: filter.from,
        to: filter.to,
        q: filter.q?.trim(),
    });
}

/** `reconciliation-2026-09-14.csv` when the server named nothing. */
export const reconciliationExportFilename = (named: string | null, now = new Date()): string =>
    named ?? `reconciliation-${now.toISOString().slice(0, 10)}.csv`;

/* ---------------- Lot G (Q124): the weekly draft ---------------- */

/**
 * `GET /finance/payout-batches/schedule` — the cadence as set on the
 * platform row, the next instant the job drafts (null while off) and the
 * last batch the schedule built, so the Payouts page can say when the next
 * run is and what the last one made.
 */
export interface PayoutSchedule {
    enabled: boolean;
    /** 0–6, Sunday 0. */
    weekday: number;
    hourIst: number;
    nextRunAt: Timestamp | null;
    lastDraft: {
        batchId: string;
        reference: string;
        status: PayoutBatchStatus;
        lineCount: number;
        totalNet: Money;
        createdAt: Timestamp;
    } | null;
}

/* ------------------------------------------------------------------ */
/* Live gate                                                           */
/* ------------------------------------------------------------------ */

/**
 * Whether these screens have a backend to read.
 *
 * `isLive("finance")` — the domain flag is `true` since Lot B wired the last
 * three fixture screens (payout batches, invoices, reconciliation), so the
 * claim the flag makes is now true and this reads it rather than
 * `apiConfig.live` directly. Every finance screen gates on this one call.
 */
export const financeReadsApi = (): boolean => isLive("finance");

/**
 * Refuses a write while the API is off.
 *
 * There is nothing to write to, and a "saved" toast over nothing is worse than
 * a refusal — particularly here, where the thing being saved is an approval to
 * move money.
 */
function mutable() {
    if (!financeReadsApi()) {
        throw new Error("The finance console is not connected to the ADX backend.");
    }
    return http;
}

const base = "/finance";

const query = (params: Record<string, string | number | undefined>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const encoded = search.toString();
    return encoded ? `?${encoded}` : "";
};

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

export const financeService = {
    /* ---------------- Wallets ---------------- */

    wallets: (filter: { kind?: WalletKind; limit?: number } = {}) =>
        http.get<WalletRow[]>(`${base}/wallets${query({ kind: filter.kind, limit: filter.limit ?? 200 })}`),

    /**
     * One wallet. A 404 is "no such wallet", which the page renders as its own
     * not-found rather than as a failed request.
     */
    wallet: async (id: string): Promise<WalletDetail | null> => {
        try {
            return await http.get<WalletDetail>(`${base}/wallets/${id}`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    walletEntries: (id: string, limit = 100) =>
        http.get<WalletEntry[]>(`${base}/wallets/${id}/entries${query({ limit })}`),

    /* ---------------- The withdrawal queue ---------------- */

    /** `status` is a comma-separated list on the wire; omit it for everything. */
    withdrawals: (filter: WithdrawalFilter = {}) =>
        http.get<Withdrawal[]>(
            `${base}/withdrawals${query({
                status: filter.status?.length ? filter.status.join(",") : undefined,
                q: filter.q?.trim(),
                partyKind: filter.partyKind,
                from: filter.from,
                to: filter.to,
                batchId: filter.batchId,
                publisherId: filter.publisherId,
                agentId: filter.agentId,
                walletId: filter.walletId,
                limit: filter.limit ?? 200,
            })}`
        ),

    /** The queue's header: rows per status, the stale-processing count and E6's three totals. */
    withdrawalSummary: () => http.get<WithdrawalSummary>(`${base}/withdrawals/summary`),

    /** Vets it and queues it for a rail. Never automatic, whatever the amount. */
    approveWithdrawal: (id: string, body: { note?: string; rail?: PayoutRailName } = {}) =>
        mutable().post<Withdrawal>(`${base}/withdrawals/${id}/approve`, body),

    rejectWithdrawal: (id: string, reason: string) =>
        mutable().post<Withdrawal>(`${base}/withdrawals/${id}/reject`, { reason }),

    /** The UTR of a transfer that has actually been made. */
    markWithdrawalPaid: (id: string, railReference: string) =>
        mutable().post<Withdrawal>(`${base}/withdrawals/${id}/mark-paid`, { railReference }),

    /** The rail refused or the transfer bounced; the money returns to the wallet. */
    failWithdrawal: (id: string, reason: string) =>
        mutable().post<Withdrawal>(`${base}/withdrawals/${id}/fail`, { reason }),

    /**
     * Lot B (B4b): a withdrawal ops raises for a party who cannot — a print
     * partner's account never signs in. The wallet names the party; the
     * method defaults to their VERIFIED default one, and every rule of the
     * party's own request applies: the minimum, the daily cap, the cleared
     * balance, the freeze. Lands REQUESTED, then the ordinary ladder.
     */
    requestWithdrawalOnBehalf: (body: {
        walletId: string;
        amount: Money;
        payoutMethodId?: string;
        note?: string;
    }) => mutable().post<Withdrawal>(`${base}/withdrawals/on-behalf`, body),

    /* ---------------- Payout methods ---------------- */

    /** The verification queue: methods a party added that nobody has proved yet. */
    pendingPayoutMethods: () => http.get<PayoutMethod[]>(`${base}/payout-methods`),

    /** D5: everything one party has, whatever its state — the agent's payouts tab. */
    payoutMethodsFor: (userId: string) =>
        http.get<PayoutMethod[]>(`${base}/payout-methods?${query({ userId })}`),

    /** D5: recorded at the desk on the party's behalf — an agent's cancelled cheque. */
    addPayoutMethodFor: (userId: string, body: NewPayoutMethodInput) =>
        mutable().post<PayoutMethod>(`${base}/payout-methods`, { userId, ...body }),

    verifyPayoutMethod: (
        id: string,
        body: { via: PayoutVerificationMethod; reference?: string; nameMatchPct?: Money }
    ) => mutable().post<PayoutMethod>(`${base}/payout-methods/${id}/verify`, body),

    rejectPayoutMethod: (id: string, reason: string) =>
        mutable().post<PayoutMethod>(`${base}/payout-methods/${id}/reject`, { reason }),

    /* ---------------- Agent incentives ---------------- */

    /**
     * `orderId` is Lot B's per-order facet — "what was this order's
     * commission?". E6 added `event` (a comma list) and `q` (the note, the
     * order id or the agent's name), so the desk's facets all cut on the
     * server rather than on a capped page.
     */
    incentives: (
        filter: {
            status?: IncentiveStatus[];
            event?: IncentiveEvent[];
            q?: string;
            agentId?: string;
            orderId?: string;
            limit?: number;
        } = {}
    ) =>
        http.get<Incentive[]>(
            `${base}/incentives${query({
                status: filter.status?.length ? filter.status.join(",") : undefined,
                event: filter.event?.length ? filter.event.join(",") : undefined,
                q: filter.q?.trim(),
                agentId: filter.agentId,
                orderId: filter.orderId,
                limit: filter.limit ?? 200,
            })}`
        ),

    creditIncentive: (id: string) =>
        mutable().post<{ id: string; status: IncentiveStatus }>(`${base}/incentives/${id}/credit`),

    rejectIncentive: (id: string, reason: string) =>
        mutable().post<{ id: string; status: IncentiveStatus }>(`${base}/incentives/${id}/reject`, {
            reason,
        }),

    /* ---------------- The numbers behind the rules ---------------- */

    limits: () => http.get<WithdrawalLimit[]>(`${base}/limits`),

    /** Upserts the rung at (band, minMonths). Adding a rung is the same call. */
    setLimit: (body: { band: PartySizeBand; minMonths: number; dailyCap: Money }) =>
        mutable().put<{ id: string; dailyCap: Money }>(`${base}/limits`, body),

    taxRates: () => http.get<TaxRate[]>(`${base}/tax-rates`),

    /**
     * Writes a new rate and closes the one in force.
     *
     * Not an edit: an accrual from last month was withheld at the old rate and
     * has to stay explicable, so rates are effective-dated rather than replaced.
     */
    setTaxRate: (body: {
        appliesTo: TaxParty;
        section: string;
        ratePct: Money;
        effectiveFrom?: string;
        note?: string;
    }) => mutable().post<{ id: string; ratePct: Money }>(`${base}/tax-rates`, body),

    incentiveRates: () => http.get<IncentiveRate[]>(`${base}/incentive-rates`),

    setIncentiveRate: (body: {
        event: IncentiveEvent;
        tier?: string;
        amount: Money;
        effectiveFrom?: string;
    }) => mutable().post<{ id: string; amount: Money }>(`${base}/incentive-rates`, body),

    /* ---------------- The books ---------------- */

    ledger: (filter: { walletId?: string; limit?: number } = {}) =>
        http.get<LedgerTransaction[]>(
            `${base}/ledger${query({ walletId: filter.walletId, limit: filter.limit ?? 200 })}`
        ),

    /** The only way to undo a posting: a mirrored entry, never a deletion. */
    reverseTransaction: (id: string, reason: string) =>
        mutable().post<{ id: string; reference: string }>(`${base}/ledger/${id}/reverse`, { reason }),

    verifyLedger: () => http.get<LedgerHealth>(`${base}/ledger/verify`),

    /* ---------------- Operations ---------------- */

    /** Credits every elapsed campaign day not yet paid. Idempotent per spot-day. */
    runAccrual: () => mutable().post<AccrualRun>(`${base}/accrual/run`),

    rails: () => http.get<RailStatus[]>(`${base}/rails`),

    /* ---------------- Payout batches (Lot B, Q85/Q140) ---------------- */

    /** The designed-list contract: items, total, and counts by status with the facet removed. */
    payoutBatches: (filter: PayoutBatchFilter = {}) =>
        http.get<ListPage<PayoutBatch>>(
            `${base}/payout-batches${query({
                status: filter.status?.length ? filter.status.join(",") : undefined,
                q: filter.q?.trim(),
                page: filter.page ?? 1,
                pageSize: filter.pageSize ?? 50,
            })}`
        ),

    /** A DRAFT with a reference and no lines yet. The rail defaults to the platform's primary. */
    createPayoutBatch: (body: NewPayoutBatchInput = {}) =>
        mutable().post<PayoutBatchDetail>(`${base}/payout-batches`, body),

    /** One batch with its lines. A 404 is "no such batch", rendered as not-found rather than failure. */
    payoutBatch: async (id: string): Promise<PayoutBatchDetail | null> => {
        try {
            return await http.get<PayoutBatchDetail>(`${base}/payout-batches/${id}`);
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    },

    /**
     * The whole line set, replaced. DRAFT only; every id must be APPROVED, on a
     * VERIFIED method and in no other open batch — refused whole otherwise,
     * with `details.problems` naming the offenders.
     */
    setPayoutBatchLines: (id: string, withdrawalIds: string[]) =>
        mutable().put<PayoutBatchDetail>(`${base}/payout-batches/${id}/lines`, { withdrawalIds }),

    submitPayoutBatch: (id: string) =>
        mutable().post<PayoutBatchDetail>(`${base}/payout-batches/${id}/submit`),

    /** Four eyes: 409 FOUR_EYES when the approver is the admin who built it. */
    approvePayoutBatch: (id: string) =>
        mutable().post<PayoutBatchDetail>(`${base}/payout-batches/${id}/approve`),

    /** Refuses on a failed preflight and moves nothing; otherwise debits every APPROVED line. */
    releasePayoutBatch: (id: string) =>
        mutable().post<ReleaseOutcome>(`${base}/payout-batches/${id}/release`),

    /** DRAFT, IN_REVIEW or APPROVED only. The lines go back to reserved-and-unbatched. */
    cancelPayoutBatch: (id: string) =>
        mutable().post<PayoutBatchDetail>(`${base}/payout-batches/${id}/cancel`),

    payoutBatchPreflight: (id: string) =>
        http.get<BatchPreflight>(`${base}/payout-batches/${id}/preflight`),

    /** The UTR of a transfer that has actually been made, on a released line. */
    markPayoutBatchLinePaid: (id: string, withdrawalId: string, utr: string) =>
        mutable().post<{ line: Withdrawal; batch: PayoutBatch }>(
            `${base}/payout-batches/${id}/lines/${withdrawalId}/mark-paid`,
            { utr }
        ),

    failPayoutBatchLine: (id: string, withdrawalId: string, reason: string) =>
        mutable().post<{ line: Withdrawal; batch: PayoutBatch }>(
            `${base}/payout-batches/${id}/lines/${withdrawalId}/fail`,
            { reason }
        ),

    /**
     * The bank's bulk-transfer CSV, pulled with the bearer token and handed to
     * the browser as a file.
     *
     * Through the api client's blob mode: the route streams `text/csv`
     * rather than a JSON envelope, but a stale access token is refreshed and
     * the request replayed the way every other read here is. The same bytes
     * as the file stored at release, and available before release as a
     * preview.
     */
    exportPayoutBatch: async (id: string): Promise<{ filename: string; bytes: number }> => {
        const result = await mutable().blob(`${base}/payout-batches/${id}/export`);
        const filename = result.filename ?? `${id}.csv`;
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },

    /**
     * G13-B: the frame's list-level Export — the batches under the desk's
     * status and search filters as one CSV (`GET
     * /finance/payout-batches/export.csv?status=&q=`, ahead of `/:id`), one
     * line per batch with the actors by name, at most 5,000 rows, through
     * the api client's blob mode. The server audits
     * `PAYOUT_BATCHES_EXPORTED` before the first byte.
     */
    exportPayoutBatches: async (filter: Pick<PayoutBatchFilter, "status" | "q"> = {}): Promise<{ filename: string; bytes: number }> => {
        const result = await mutable().blob(`${base}/payout-batches/export.csv${payoutBatchesExportQuery(filter)}`);
        const filename = result.filename ?? payoutBatchesExportFilename();
        saveBlob(result.blob, filename);
        return { filename, bytes: result.blob.size };
    },

    /**
     * Lot G (Q124): the weekly draft's cadence and the next instant it
     * fires. Registered on the server ahead of `/:id`, so the word
     * `schedule` is never read as a batch id.
     */
    payoutSchedule: () => http.get<PayoutSchedule>(`${base}/payout-batches/schedule`),

    /* ---------------- ADX bank accounts ---------------- */

    bankAccounts: () => http.get<BankAccount[]>(`${base}/bank-accounts`),

    /** Create: no `id`. The whole number goes in; only its last four digits are kept. */
    createBankAccount: (body: Omit<BankAccountInput, "id">) =>
        mutable().put<BankAccount>(`${base}/bank-accounts`, body),

    /** Update: the same PUT with an `id`. Setting a default clears the rest. */
    updateBankAccount: (id: string, body: Omit<BankAccountInput, "id">) =>
        mutable().put<BankAccount>(`${base}/bank-accounts`, { id, ...body }),

    /* ---------------- Reconciliation (Lot B, Q85) ---------------- */

    reconciliation: {
        profiles: () => http.get<StatementProfile[]>(`${base}/reconciliation/profiles`),

        createProfile: (body: NewStatementProfileInput) =>
            mutable().post<StatementProfile>(`${base}/reconciliation/profiles`, body),

        imports: (filter: { bankAccountId?: string; limit?: number } = {}) =>
            http.get<StatementImport[]>(
                `${base}/reconciliation/imports${query({
                    bankAccountId: filter.bankAccountId,
                    limit: filter.limit ?? 50,
                })}`
            ),

        /** Multipart: the CSV as `file`, beside the account and the optional profile. */
        importStatement: (input: { file: File; bankAccountId: string; profileId?: string }) =>
            mutable().post<StatementImportOutcome>(
                `${base}/reconciliation/imports`,
                statementImportBody(input)
            ),

        /** The list contract over lines: items, total, counts by `matchStatus`. */
        lines: (filter: BankLineFilter = {}) =>
            http.get<ListPage<BankStatementLine>>(
                `${base}/reconciliation/lines${query({
                    status: filter.status?.length ? filter.status.join(",") : undefined,
                    bankAccountId: filter.bankAccountId,
                    importId: filter.importId,
                    from: filter.from,
                    to: filter.to,
                    q: filter.q?.trim(),
                    page: filter.page ?? 1,
                    pageSize: filter.pageSize ?? 50,
                })}`
            ),

        /** Explains every UNMATCHED line it safely can. Never guesses. */
        autoMatch: (window: ReconciliationWindow = {}) =>
            mutable().post<AutoMatchOutcome>(`${base}/reconciliation/auto-match`, window),

        /** A person names the record — exactly one of the four ids. */
        match: (lineId: string, target: MatchTarget, note?: string) =>
            mutable().post<BankStatementLine>(`${base}/reconciliation/lines/${lineId}/match`, {
                ...target,
                ...(note ? { note } : {}),
            }),

        /** Bank charges, interest: set aside. */
        ignore: (lineId: string, note?: string) =>
            mutable().post<BankStatementLine>(`${base}/reconciliation/lines/${lineId}/ignore`, {
                ...(note ? { note } : {}),
            }),

        unmatch: (lineId: string) =>
            mutable().post<BankStatementLine>(`${base}/reconciliation/lines/${lineId}/unmatch`),

        summary: (window: ReconciliationWindow = {}) =>
            http.get<ReconciliationSummary>(
                `${base}/reconciliation/summary${query({
                    bankAccountId: window.bankAccountId,
                    from: window.from,
                    to: window.to,
                })}`
            ),

        /**
         * Lot G (Q125): every line of one import as a CSV — the match state,
         * the ADX record that explains each line, who resolved it and when.
         * Through the blob helper and handed to the browser; the server
         * audits `RECONCILIATION_LINES_EXPORTED` before the first byte.
         */
        exportImport: async (importId: string): Promise<{ filename: string; bytes: number }> => {
            const result = await mutable().blob(`${base}/reconciliation/imports/${encodeURIComponent(importId)}/export.csv`);
            const filename = reconciliationExportFilename(result.filename);
            saveBlob(result.blob, filename);
            return { filename, bytes: result.blob.size };
        },

        /** Lot G (Q125): the same CSV over every line the desk's filters match, no page, 50,000 at most. */
        exportLines: async (filter: Omit<BankLineFilter, "page" | "pageSize"> = {}): Promise<{ filename: string; bytes: number }> => {
            const result = await mutable().blob(`${base}/reconciliation/lines/export.csv${reconciliationExportQuery(filter)}`);
            const filename = reconciliationExportFilename(result.filename);
            saveBlob(result.blob, filename);
            return { filename, bytes: result.blob.size };
        },
    },
};

/* ------------------------------------------------------------------ */
/* Request bodies and file transport                                   */
/* ------------------------------------------------------------------ */

/** The multipart body `POST /finance/reconciliation/imports` reads: `file` plus the two fields. */
export function statementImportBody(input: { file: File; bankAccountId: string; profileId?: string }): FormData {
    const body = new FormData();
    body.append("file", input.file, input.file.name);
    body.append("bankAccountId", input.bankAccountId);
    if (input.profileId) body.append("profileId", input.profileId);
    return body;
}

/** Re-exported for the batch page and its tests; the parser lives with the blob reader now. */
export { attachmentFilename };

/* ------------------------------------------------------------------ */
/* Display metadata                                                    */
/* ------------------------------------------------------------------ */

/*
 * Kept beside the wire types rather than in `@/types`, because these label the
 * backend's enums and must move when the backend's enums move. The fixture
 * vocabulary in `@/types/finance.ts` describes a different, older set of
 * states ("pending", "on_hold") and is not the same thing.
 */

export const WITHDRAWAL_STATUS_META: Record<WithdrawalStatus, StatusMeta> = {
    REQUESTED: { label: "Awaiting review", tone: "warning" },
    APPROVED: { label: "Approved", tone: "info" },
    PROCESSING: { label: "With the rail", tone: "info" },
    PAID: { label: "Paid", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    FAILED: { label: "Failed", tone: "danger" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const PAYOUT_METHOD_STATUS_META: Record<PayoutMethodStatus, StatusMeta> = {
    PENDING_VERIFICATION: { label: "Awaiting verification", tone: "warning" },
    VERIFIED: { label: "Verified", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

export const INCENTIVE_STATUS_META: Record<IncentiveStatus, StatusMeta> = {
    PENDING_VERIFICATION: { label: "Awaiting ops", tone: "warning" },
    CREDITED: { label: "Credited", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
};

export const WALLET_KIND_LABEL: Record<WalletKind, string> = {
    PUBLISHER: "Publisher",
    AGENT: "Agent",
    ADVERTISER: "Advertiser",
    PRINT_PARTNER: "Print partner",
};

/** The four payees a withdrawal can belong to — the batch line's "Type" column. */
export const PARTY_KIND_LABEL: Record<PayoutPartyKind, string> = WALLET_KIND_LABEL;

export const PAYOUT_PARTY_KINDS: readonly PayoutPartyKind[] = ["PUBLISHER", "AGENT", "ADVERTISER", "PRINT_PARTNER"];

/**
 * A batch's status, labelled. The first four are the process's own; the last
 * four are derived from the lines once it has been released (`batch-status.ts`).
 */
export const PAYOUT_BATCH_STATUS_META: Record<PayoutBatchStatus, StatusMeta> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    IN_REVIEW: { label: "In review", tone: "info" },
    APPROVED: { label: "Approved", tone: "info" },
    RELEASING: { label: "Releasing", tone: "warning" },
    RELEASED: { label: "Processing", tone: "warning" },
    COMPLETED: { label: "Completed", tone: "success" },
    PARTIALLY_FAILED: { label: "Partly failed", tone: "danger" },
    FAILED: { label: "Failed", tone: "danger" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const BANK_LINE_STATUS_META: Record<BankLineMatchStatus, StatusMeta> = {
    MATCHED: { label: "Matched", tone: "success" },
    UNMATCHED: { label: "Unmatched", tone: "danger" },
    DIFFERS: { label: "Amount differs", tone: "warning" },
    IGNORED: { label: "Ignored", tone: "neutral" },
};

/** What each preflight code means to the person about to release. */
export const PREFLIGHT_PROBLEM_LABEL: Record<LinePreflightProblem, string> = {
    METHOD_NOT_VERIFIED: "Payout method not verified",
    WALLET_MISSING: "No wallet behind this line",
    KYC_NOT_VERIFIED: "KYC not verified",
    USER_INACTIVE: "Account deactivated",
    PARTNER_INACTIVE: "Print partner deactivated",
    WALLET_SHORT: "Wallet no longer covers it",
    WALLET_FROZEN: "Wallet frozen",
};

/** A preflight problem, readable. `NOT_APPROVED:<status>` carries the status it found instead. */
export function preflightProblemLabel(code: string): string {
    const known = PREFLIGHT_PROBLEM_LABEL[code as LinePreflightProblem];
    if (known) return known;
    const notApproved = code.match(/^NOT_APPROVED:(.+)$/);
    if (notApproved?.[1]) {
        const status = notApproved[1] as WithdrawalStatus;
        return `Not approved — ${(WITHDRAWAL_STATUS_META[status]?.label ?? status).toLowerCase()}`;
    }
    const words = code.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export const SIZE_BAND_LABEL: Record<PartySizeBand, string> = {
    INDIVIDUAL: "Individual",
    SMALL_AGENCY: "Small agency",
    LARGE_AGENCY: "Large agency",
};

export const INCENTIVE_EVENT_LABEL: Record<IncentiveEvent, string> = {
    PUBLISHER_ONBOARDED: "Publisher onboarded",
    SITE_VISIT: "Site visit",
    CAMPAIGN_ASSIST: "Campaign assist",
    /** DR 05: a claimed milestone — recorded here, released by finance. */
    MILESTONE_BONUS: "Milestone bonus",
    /** DR 05: a promotion to a new tier, at the rate configured for it. */
    TIER_BONUS: "Tier bonus",
    /** DR 06: the commission on a package the agent sold. */
    PACKAGE_SOLD: "Package sold",
    /** Lot B (Q102): the installation commission, recorded at sign-off. */
    INSTALLATION: "Installation",
    /** Lot B (Q101): the twin of PUBLISHER_ONBOARDED, on the demand side. */
    ADVERTISER_ONBOARDED: "Advertiser onboarded",
};

/**
 * The label for an event, or a readable fallback for one this map has not
 * heard of. The queue prints whatever the enum grows to; "undefined" in the
 * "What for" column is the failure this guards against.
 */
export function incentiveEventLabel(event: string): string {
    const known = INCENTIVE_EVENT_LABEL[event as IncentiveEvent];
    if (known) return known;
    if (!event) return "—";
    const words = event.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export const RAIL_LABEL: Record<PayoutRailName, string> = {
    MANUAL_NEFT: "Manual NEFT",
    RAZORPAY_X: "Razorpay X",
    CASHFREE: "Cashfree",
};

export const LEDGER_KIND_LABEL: Record<LedgerTransactionKind, string> = {
    TOPUP: "Top-up",
    CAMPAIGN_SPEND: "Campaign spend",
    PACKAGE_SPEND: "Package spend",
    PUBLISHER_EARNING: "Publisher earning",
    AGENT_INCENTIVE: "Agent incentive",
    PAYOUT: "Payout",
    REFUND: "Refund",
    GOODWILL: "Goodwill",
    PENALTY: "Penalty",
    ADJUSTMENT: "Adjustment",
    EXPIRY: "Expiry",
    PRINT_COST: "Print cost",
    REVERSAL: "Reversal",
};

/** A wallet entry's `type` is the backend's `WalletEntryType`. */
export const ENTRY_TYPE_LABEL: Record<string, string> = {
    TOPUP: "Top-up",
    CAMPAIGN_DEBIT: "Campaign debit",
    PACKAGE_DEBIT: "Package debit",
    GOODWILL_CREDIT: "Goodwill credit",
    REFUND: "Refund",
    ADJUSTMENT: "Adjustment",
    EARNING: "Earning",
    BONUS: "Bonus",
    REFERRAL: "Referral",
    PAYOUT: "Payout",
    PENALTY: "Penalty",
    EXPIRY: "Expiry",
};

/** How a payout method was proved. */
export const VERIFIED_VIA_LABEL: Record<PayoutVerificationMethod, string> = {
    PENNY_DROP: "Penny drop",
    NAME_LOOKUP: "Name lookup",
    MANUAL: "Manual check",
};

/** A short, readable stand-in for a cuid in a table cell. */
export const shortId = (id: string, prefix = ""): string =>
    `${prefix}${id.slice(-6).toUpperCase()}`;

/** How a payout method reads on one line: "HDFC •••• 4417" or a VPA. */
export function describeMethod(method: PayoutMethod): string {
    if (method.type === "UPI") return method.upiVpa ?? "UPI";
    return [method.bankName, method.accountNumberMasked].filter(Boolean).join(" ") || "Bank account";
}

/**
 * The name to put on a withdrawal row.
 *
 * Lot B (Q140) made `GET /finance/withdrawals` join the wallet's owner, so the
 * party's own name leads. The name on the payout method — what the transfer is
 * actually made out to, and what ops checks against KYC — stands in when the
 * join found nobody, and the wallet id is the last resort.
 */
export const beneficiaryOf = (withdrawal: Withdrawal): string =>
    withdrawal.partyName ||
    withdrawal.method.accountHolder ||
    withdrawal.method.upiVpa ||
    `Wallet ${shortId(withdrawal.walletId)}`;

/** How an ADX bank account reads on one line: "HDFC Bank •••• 8912". */
export function describeBankAccount(account: BankAccount): string {
    return [account.bankName, account.accountNumberMasked].filter(Boolean).join(" ");
}

/**
 * A withdrawal's payout is APPROVED-reserved until a batch releases it, so the
 * "approved, waiting for a batch" figure is the sum of those rows' net — the
 * summary endpoint counts rows and carries no money, so this is the one place
 * the total comes from.
 */
export const reservedTotal = (withdrawals: readonly Withdrawal[]): Money =>
    sumMoney(withdrawals.filter((row) => row.status === "APPROVED").map((row) => row.netAmount));
