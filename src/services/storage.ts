import { api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { StatusMeta } from "@/types";

/**
 * ST-4 (28 Sep 2026): Settings › Storage — the one file register read back.
 *
 * Every upload comes through one door (`POST /upload`) into one register
 * (`UploadedFile`) and one bucket, a folder per purpose, public or private
 * by purpose. This is the report over it: space by purpose, the largest
 * files, and the files nothing on the platform refers to (ST-3's weekly
 * sweep marks them). The sweep's removal switch and grace period live on
 * the platform row (`settings.storage`, `PUT /settings/platform`); the
 * owner's rule is that removal stays OFF until somebody has read the
 * unreferenced list, because a wrong reference index must never delete a
 * live file.
 *
 *   GET  /storage/summary         settings.view — totals, by purpose, largest, the sweep
 *   GET  /storage/unreferenced    settings.view — the marked files, paged
 *   POST /storage/sweep           system.jobs   — the mark phase now; never removes
 */

export type FileVisibility = "PUBLIC" | "PRIVATE";

/** Who can open a folder's files: anyone holding the link, or only through `GET /files/:id` with a sign-in. */
export const VISIBILITY_META: Record<FileVisibility, StatusMeta> = {
    PUBLIC: { label: "Public", tone: "info" },
    PRIVATE: { label: "Private", tone: "neutral" },
};

export interface StoragePurposeRow {
    purpose: string;
    /** The bucket folder, under the private prefix when the purpose is private. */
    folder: string;
    visibility: FileVisibility;
    files: number;
    bytes: number;
    unreferencedFiles: number;
    unreferencedBytes: number;
}

export interface StorageLargestFile {
    id: string;
    filename: string;
    purpose: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    uploadedBy: { id: string; name: string | null } | null;
}

export interface StorageSweepState {
    /** Null until the sweep has run once. */
    lastRunAt: string | null;
    lastMarked: number | null;
    lastRemoved: number | null;
    /** `settings.storage.removeUnreferenced`, as the sweep will read it. */
    removeEnabled: boolean;
    graceDays: number;
    /** The purposes the sweep never removes — each has its own retention rule. */
    protectedPurposes: string[];
    /** When the last run failed, and why — absent on a backend that does not say. */
    lastFailedAt?: string | null;
    lastError?: string | null;
}

export interface StorageSummary {
    generatedAt: string;
    totals: { files: number; bytes: number };
    byPurpose: StoragePurposeRow[];
    /** The top 25 by size. */
    largest: StorageLargestFile[];
    sweep: StorageSweepState;
}

export interface UnreferencedFile {
    id: string;
    filename: string;
    purpose: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    unreferencedSince: string;
    /** `unreferencedSince` + the grace period. The list leaves the protected purposes out; a null is drawn as "never" all the same. */
    removableAt: string | null;
    /** The URL the register records: the public one, or `/files/:id` for a private file — opened through the private-file door either way. */
    url: string;
}

export interface UnreferencedPage {
    items: UnreferencedFile[];
    total: number;
    page: number;
    pageSize: number;
}

export interface UnreferencedQuery {
    purpose?: string | null;
    page?: number;
    pageSize?: number;
}

/** What "Check now" did: files looked at, newly marked, and marks cleared because something refers to them again. */
export interface StorageSweepRun {
    checked: number;
    marked: number;
    cleared: number;
}

export const UNREFERENCED_PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * What each purpose is, the way an operator would name the folder. The
 * purpose is a string on the register, not an enum, so a purpose this
 * console has not met yet is still drawn — by `purposeLabel`'s fallback.
 */
export const PURPOSE_LABEL: Record<string, string> = {
    KYC: "Publisher KYC",
    AGENT_KYC: "Agent KYC",
    ADVERTISER_KYC: "Advertiser KYC",
    EMPLOYEE_KYC: "Employee KYC",
    USER_KYC: "User KYC",
    PRINT_PARTNER_KYC: "Print partner KYC",
    DISPUTE_EVIDENCE: "Dispute evidence",
    LISTING_PHOTO: "Listing photos",
    VERIFICATION: "Venue papers & site photos",
    AVATAR: "Profile pictures",
    BRANDING: "Brand files",
    MEDIA: "Media library",
    CAMPAIGN_CREATIVE: "Campaign creatives",
    TOPUP_PROOF: "Top-up proofs",
    PAYOUT_EXPORT: "Payout bank files",
    BANK_STATEMENT: "Bank statements",
    INVOICE: "Invoices",
    STATEMENT: "Payment statements",
    REPORT: "Report runs",
    DATA_EXPORT: "Data exports",
    BOOKING_REPORT: "Booking reports",
    PARTNER_RATE_CARD: "Print partner rate cards",
    PARTNER_INVOICE: "Print partner invoices",
    SUPPORT_ATTACHMENT: "Support attachments",
    SIGNED_AGREEMENT: "Signed agreements",
    LEAD_CAPTURE: "Lead captures",
    CALL_RECORDING: "Call recordings",
    VISIT_PROOF: "Visit proofs",
    COMPETITOR_CAPTURE: "Competitor sightings",
    FORM_UPLOAD: "Form uploads",
    OTHER: "Other",
};

/** "Listing photos"; an unknown `SOME_NEW_THING` reads as "Some new thing". */
export function purposeLabel(purpose: string): string {
    const known = PURPOSE_LABEL[purpose];
    if (known) return known;
    const words = purpose.toLowerCase().replace(/_/g, " ").trim();
    return words ? words[0]!.toUpperCase() + words.slice(1) : purpose;
}

const KB = 1024;

/** 0 B · 812 B · 14 KB · 3.4 MB · 1.25 GB — the register's sizes run from an avatar to a year of invoices. */
export function formatStorageBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < KB) return `${Math.round(bytes)} B`;
    if (bytes < KB * KB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
    if (bytes < KB * KB * KB) return `${(bytes / (KB * KB)).toFixed(1)} MB`;
    return `${(bytes / (KB * KB * KB)).toFixed(2)} GB`;
}

/**
 * A folder row's key. A purpose can have two rows — its public files and its
 * private ones — while a move is half done (ST-2's venue papers until the
 * privatise script has run), so the purpose alone is not unique.
 */
export const purposeRowKey = (row: Pick<StoragePurposeRow, "purpose" | "visibility">): string => `${row.purpose}|${row.visibility}`;

/** The folders sorted the way the table reads them: the heaviest first, then by name. */
export function purposesBySize(rows: StoragePurposeRow[]): StoragePurposeRow[] {
    return [...rows].sort((a, b) => b.bytes - a.bytes || purposeLabel(a.purpose).localeCompare(purposeLabel(b.purpose)) || a.visibility.localeCompare(b.visibility));
}

/**
 * What the unreferenced list can show, by purpose: the marked files of every
 * purpose the sweep may remove, public and private rows of one purpose
 * together, the most first. The protected purposes are marked too but never
 * listed (`GET /storage/unreferenced` leaves them out) — their own retention
 * rule decides when they go.
 */
export function listableUnreferenced(rows: StoragePurposeRow[], protectedPurposes: readonly string[]): { purpose: string; files: number; bytes: number }[] {
    const byPurpose = new Map<string, { purpose: string; files: number; bytes: number }>();
    for (const row of rows) {
        if (row.unreferencedFiles <= 0 || protectedPurposes.includes(row.purpose)) continue;
        const current = byPurpose.get(row.purpose) ?? { purpose: row.purpose, files: 0, bytes: 0 };
        byPurpose.set(row.purpose, { purpose: row.purpose, files: current.files + row.unreferencedFiles, bytes: current.bytes + row.unreferencedBytes });
    }
    return [...byPurpose.values()].sort((a, b) => b.files - a.files || purposeLabel(a.purpose).localeCompare(purposeLabel(b.purpose)));
}

/** Files and bytes on one side of the public/private line. */
export function visibilityTotals(rows: StoragePurposeRow[], visibility: FileVisibility): { files: number; bytes: number } {
    return rows
        .filter((row) => row.visibility === visibility)
        .reduce((sum, row) => ({ files: sum.files + row.files, bytes: sum.bytes + row.bytes }), { files: 0, bytes: 0 });
}

/** Everything the sweep has marked, across the folders. */
export function unreferencedTotals(rows: StoragePurposeRow[]): { files: number; bytes: number } {
    return rows.reduce((sum, row) => ({ files: sum.files + row.unreferencedFiles, bytes: sum.bytes + row.unreferencedBytes }), { files: 0, bytes: 0 });
}

const plural = (count: number, noun: string) => `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;

/** "Last checked 21 Sep, 3:00 AM · 12 marked · none removed", or that it has not run. */
export function sweepLine(sweep: StorageSweepState): string {
    if (!sweep.lastRunAt) return "The sweep has not run yet.";
    const marked = sweep.lastMarked ?? 0;
    const removed = sweep.lastRemoved ?? 0;
    return `Last checked ${formatDateTime(sweep.lastRunAt)} · ${plural(marked, "file")} marked · ${removed === 0 ? "none" : formatNumber(removed)} removed`;
}

/** "The last sweep failed on …: <reason>" — only when the failure is newer than the last good run. */
export function sweepFailureLine(sweep: Pick<StorageSweepState, "lastRunAt" | "lastFailedAt" | "lastError">): string | null {
    if (!sweep.lastFailedAt) return null;
    if (sweep.lastRunAt && Date.parse(sweep.lastRunAt) >= Date.parse(sweep.lastFailedAt)) return null;
    return `The last sweep failed on ${formatDateTime(sweep.lastFailedAt)}${sweep.lastError ? `: ${sweep.lastError}` : "."}`;
}

/** The toast after "Check now". */
export function sweepRunLine(run: StorageSweepRun): string {
    return `${plural(run.checked, "file")} checked · ${formatNumber(run.marked)} newly unreferenced · ${formatNumber(run.cleared)} referred to again`;
}

/** The "Removable on" cell: the date, or why there is none. */
export function removableLine(file: Pick<UnreferencedFile, "purpose" | "removableAt">, protectedPurposes: readonly string[]): string {
    if (protectedPurposes.includes(file.purpose) || !file.removableAt) return "Never — kept by its own retention rule";
    return `Removable on ${formatDate(file.removableAt)}`;
}

/** The query string, exported for the test that pins it. */
export function unreferencedSearch(query: UnreferencedQuery = {}): string {
    const params = new URLSearchParams();
    if (query.purpose) params.set("purpose", query.purpose);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? UNREFERENCED_PAGE_SIZE));
    return `?${params.toString()}`;
}

/** These screens read the API or say they cannot; there is no fixture of a bucket. */
export const storageReadApi = (): boolean => apiConfig.live;

export const storageService = {
    summary: (): Promise<StorageSummary> => http.get<StorageSummary>("/storage/summary"),

    unreferenced: (query: UnreferencedQuery = {}): Promise<UnreferencedPage> => http.get<UnreferencedPage>(`/storage/unreferenced${unreferencedSearch(query)}`),

    /** The mark phase, now. Removal only ever happens on the weekly run, and only when the switch is on. */
    sweep: (): Promise<StorageSweepRun> => http.post<StorageSweepRun>("/storage/sweep", {}),
};
