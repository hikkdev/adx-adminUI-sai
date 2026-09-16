"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, FileText, Landmark, Pencil, Plus, Send, Smartphone, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FileDropzone } from "@/components/adx/file-dropzone";
import { DetailShell } from "@/components/adx/detail-shell";
import { PrivateFile, openPrivateFile } from "@/components/adx/private-file";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import { compareMoney, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    ENTRY_TYPE_LABEL,
    PAYOUT_METHOD_STATUS_META,
    RAIL_LABEL,
    WITHDRAWAL_STATUS_META,
    describeMethod,
    financeService,
    shortId,
    type PayoutMethod,
} from "@/services/finance";
import {
    INVOICE_MONTH_PATTERN,
    PRINT_JOB_STATUS_META,
    QUOTE_REQUEST_STATUS_META,
    QUOTE_STATUS_META,
    SIGN_IN_STATE_META,
    canActivate,
    capabilitiesLine,
    isKycRequired,
    lastSignInLabel,
    partnerMovesLine,
    printPartnerService,
    rateCardProblem,
    signInState,
    type PartnerFile,
    type PartnerInvoice,
    type PartnerQuoteHistoryRow,
    type PrintJob,
    type PrintPartner,
    type PrintPartnerLedger,
    type RateCardRow,
} from "@/services/print-partners";
import { uploadService } from "@/services/uploads";
import type { KpiStat } from "@/types";
import { AddPayoutMethodDialog } from "@/app/(admin)/agents/[id]/agent-payouts-tab";
import { PartnerDialog } from "../partner-dialog";
import { PartnerKycCard } from "./partner-kyc-card";

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

interface PartnerViewProps {
    ledger: PrintPartnerLedger;
    /** Null when the finance API is off. */
    methods: PayoutMethod[] | null;
    /** Lot H: the partner's quote history; null when the read failed (the quotes feature off, say). */
    quotes: PartnerQuoteHistoryRow[] | null;
    /** G13-B: the invoices with their months; null when that read failed and the ledger's list stands in. */
    invoices: PartnerInvoice[] | null;
    onChanged: () => void;
}

/**
 * One print partner — the shop, its account, its jobs, its quotes and its
 * money (Lot B, B4b; Lot H, Q147).
 *
 * The wallet holds net-of-tax print costs approved on the order pages. Ops
 * create the account switched off and **activate** it here; from then on the
 * partner signs in by OTP, keeps a rate card or takes quote requests, walks
 * its jobs to handover by scan, and raises its own withdrawals — every one of
 * those moves reads back on this page. A partner that never activates is
 * still settled from here: ops record the bank account, raise the withdrawal
 * on its behalf, and the ordinary ladder takes it from REQUESTED.
 *
 * G13-B/C: the same holds for the shop's paperwork — ops set the rate card
 * (`PUT /print-partners/:id/rate-card`, a file, rows or both), flip
 * "Accepts quote requests" (`PATCH /print-partners/:id`) and record a
 * month's invoice (`POST /print-partners/:id/invoices`) on the partner's
 * behalf, each audited `onBehalf: true`; the invoices card lists
 * `GET /print-partners/:id/invoices` with the month and who recorded each,
 * and the App sign-in tile carries the last sign-in.
 *
 * Lot N: the KYC card on the Shop tab is the partner's record — the desk's
 * ask and its recording live there. When `kyc.printPartnerActivationRequiresKyc`
 * is on, Activate answers 409 `KYC_REQUIRED` until the record is VERIFIED;
 * the refusal is explained on that card rather than toasted as a code.
 */
export function PartnerView({ ledger, methods, quotes, invoices: invoicesWithMonths, onChanged }: PartnerViewProps) {
    const { partner, balances, entries, withdrawals, jobs, jobCounts, invoices } = ledger;
    const { can } = useAuth();
    const [editing, setEditing] = React.useState(false);
    const [deactivating, setDeactivating] = React.useState(false);
    const [activating, setActivating] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [addingMethod, setAddingMethod] = React.useState(false);
    const [withdrawing, setWithdrawing] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [activationRefusal, setActivationRefusal] = React.useState<string | null>(null);

    const openJobs = (jobCounts.REQUESTED ?? 0) + (jobCounts.ACCEPTED ?? 0) + (jobCounts.PRINTING ?? 0) + (jobCounts.READY ?? 0);
    const signIn = signInState(partner);

    const kpis: KpiStat[] = [
        { id: "balance", label: "Wallet balance", value: formatMoney(balances?.balance ?? "0.00"), hint: "Net of TDS under 194C" },
        { id: "withdrawable", label: "Withdrawable", value: formatMoney(balances?.withdrawable ?? "0.00"), hint: "Less what is already asked for" },
        { id: "open", label: "Jobs in hand", value: String(openJobs), hint: `${jobCounts.COLLECTED ?? 0} collected` },
        {
            id: "roster",
            label: "App sign-in",
            value: SIGN_IN_STATE_META[signIn].label,
            hint:
                signIn === "ACTIVE" && partner.activatedAt
                    ? `Since ${formatDate(partner.activatedAt)} · last sign-in ${lastSignInLabel(partner, formatDateTime)}`
                    : signIn === "INVITED"
                      ? "Account not yet switched on"
                      : (partner.displayId ?? "No PRT id"),
        },
    ];

    async function activate() {
        setBusy(true);
        setActivationRefusal(null);
        try {
            const result = await printPartnerService.activate(partner.id);
            toast.success(
                result.activated ? `${partner.name} can sign in` : `${partner.name} was already activated`,
                result.activated
                    ? { description: `An SMS told ${partner.mobile} the ADX app now takes this number. OTP sign-in answers from here on.` }
                    : undefined
            );
            setActivating(false);
            onChanged();
        } catch (cause) {
            if (isKycRequired(cause)) {
                setActivationRefusal(cause.message);
                setActivating(false);
                toast.error("Activation refused: the partner's KYC is not verified", {
                    description: "The KYC card on the Shop tab has the two ways in — record it at the desk, or ask the partner.",
                });
            } else {
                toast.error(cause instanceof Error ? cause.message : "That did not go through.");
            }
        } finally {
            setBusy(false);
        }
    }

    async function toggleRoster() {
        setBusy(true);
        try {
            if (partner.isActive) {
                await printPartnerService.deactivate(partner.id, reason);
                toast.success(`${partner.name} is off the roster`, {
                    description: "No new job may name it, and the app is switched off — every session ended. Jobs already open still run and are still paid.",
                });
            } else {
                await printPartnerService.reactivate(partner.id);
                toast.success(`${partner.name} is back on the roster`, {
                    description: partner.activatedAt ? "The app signs in again." : "Activate the account when the shop should sign in.",
                });
            }
            setDeactivating(false);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <DetailShell
                backHref="/print-partners/roster"
                backLabel="Print partners"
                title={partner.name}
                subtitle={[partner.displayId, partner.legalName, partner.city].filter(Boolean).join(" · ") || undefined}
                kpis={kpis}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" onClick={() => setEditing(true)}>
                            <Pencil className="mr-1.5 size-4" />
                            Edit
                        </Button>
                        {canActivate(partner) && (
                            <Button disabled={busy} onClick={() => setActivating(true)}>
                                <Smartphone className="mr-1.5 size-4" />
                                Activate
                            </Button>
                        )}
                        {partner.isActive ? (
                            <Button variant="outline" className="bg-card text-danger hover:text-danger" disabled={busy} onClick={() => setDeactivating(true)}>
                                Deactivate
                            </Button>
                        ) : (
                            <Button variant="outline" className="bg-card" disabled={busy} onClick={() => void toggleRoster()}>
                                Reactivate
                            </Button>
                        )}
                    </div>
                }
                tabs={[
                    {
                        value: "overview",
                        label: "Shop",
                        content: (
                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-base font-semibold text-foreground">The shop</h3>
                                    <FieldList
                                        className="mt-4"
                                        items={[
                                            ["Legal name", partner.legalName ?? "—"],
                                            ["GSTIN", <span key="gstin" className="font-mono text-xs">{partner.gstin ?? "—"}</span>],
                                            ["PAN", <span key="pan" className="font-mono text-xs">{partner.panNumber ?? "—"}</span>],
                                            ["Contact", partner.contactName ?? "—"],
                                            ["Mobile", <span key="mobile" className="font-mono text-xs">{partner.mobile}</span>],
                                            ["Email", partner.email ?? "—"],
                                            ["Address", <span key="address" className="text-right">{[partner.address, partner.city].filter(Boolean).join(", ") || "—"}</span>],
                                            ["On the roster since", formatDate(partner.createdAt)],
                                        ]}
                                    />
                                </Card>
                                <AccountCard partner={partner} onActivate={() => setActivating(true)} busy={busy} onChanged={onChanged} />
                                <PartnerKycCard partner={partner} activationRefusal={activationRefusal} onChanged={onChanged} />
                                <Card className="rounded-lg border-border p-5 shadow-none">
                                    <h3 className="text-base font-semibold text-foreground">What it prints</h3>
                                    <FieldList
                                        className="mt-4"
                                        items={[
                                            ["Capabilities", <span key="caps" className="text-right">{capabilitiesLine(partner)}</span>],
                                            ["Widest print", partner.maxWidthFt ? `${partner.maxWidthFt} ft` : "—"],
                                            ["Turnaround", partner.turnaroundDays !== null ? `${partner.turnaroundDays} days` : "—"],
                                        ]}
                                    />
                                    {partner.notes && (
                                        <p className="mt-4 whitespace-pre-line border-t pt-4 text-sm text-muted-foreground">{partner.notes}</p>
                                    )}
                                </Card>
                                <InvoicesCard partner={partner} invoices={invoicesWithMonths ?? invoices} withMonths={invoicesWithMonths !== null} latestId={partner.invoiceUploadFileId} onChanged={onChanged} />
                                <RateCardCard partner={partner} onChanged={onChanged} />
                            </div>
                        ),
                    },
                    {
                        value: "jobs",
                        label: `Jobs (${jobs.length})`,
                        content: <JobsTable jobs={jobs} />,
                    },
                    {
                        value: "quotes",
                        label: quotes ? `Quotes (${quotes.length})` : "Quotes",
                        content: <QuotesTable quotes={quotes} />,
                    },
                    {
                        value: "wallet",
                        label: "Wallet",
                        content: (
                            <WalletTab
                                ledger={ledger}
                                methods={methods}
                                mayEdit={can("finance.edit")}
                                onAddMethod={() => setAddingMethod(true)}
                                onWithdraw={() => setWithdrawing(true)}
                            />
                        ),
                    },
                ]}
            />

            <PartnerDialog open={editing} onOpenChange={setEditing} partner={partner} onSaved={onChanged} />

            <ConfirmDialog
                open={activating}
                onOpenChange={setActivating}
                title={`Switch ${partner.name}'s account on?`}
                description={`An SMS tells ${partner.mobile} that the ADX app now takes this number. The shop signs in by OTP from then on, keeps its rate card or takes quote requests, walks its jobs to handover, and raises its own withdrawals. Nothing here can be sent twice — a second activation sends nothing.`}
                confirmLabel="Activate and send the SMS"
                busy={busy}
                onConfirm={() => void activate()}
            />

            <ConfirmDialog
                open={deactivating}
                onOpenChange={setDeactivating}
                title={`Take ${partner.name} off the roster?`}
                description="No new job may name it, the app is switched off and every session the shop holds is ended. Jobs already open run to the end, their costs are still approved and still paid. It can be put back at any time."
                confirmLabel="Deactivate"
                destructive
                busy={busy}
                onConfirm={() => void toggleRoster()}
            >
                <Textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Why — appended to the partner's notes. Optional."
                />
            </ConfirmDialog>

            <AddPayoutMethodDialog
                open={addingMethod}
                onOpenChange={setAddingMethod}
                userId={partner.userId}
                agentName={partner.name}
                onAdded={onChanged}
            />

            {ledger.walletId && (
                <RaiseWithdrawalDialog
                    open={withdrawing}
                    onOpenChange={setWithdrawing}
                    walletId={ledger.walletId}
                    partnerName={partner.name}
                    withdrawable={balances?.withdrawable ?? "0.00"}
                    methods={(methods ?? []).filter((method) => method.status === "VERIFIED")}
                    onRaised={onChanged}
                />
            )}
        </>
    );
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

function JobsTable({ jobs }: { jobs: PrintJob[] }) {
    return (
        <SimpleTable<PrintJob>
            rows={jobs}
            rowKey={(job) => job.id}
            emptyMessage="No job has named this shop yet. One is opened from an order's Printing card."
            columns={[
                {
                    key: "order",
                    label: "Order",
                    render: (job) => (
                        <Link href={`/orders/${job.orderId}`} className="font-mono text-xs underline-offset-4 hover:underline">
                            {shortId(job.orderId, "ORD-")}
                        </Link>
                    ),
                },
                { key: "status", label: "Status", render: (job) => <StatusBadge status={PRINT_JOB_STATUS_META[job.status]} /> },
                { key: "quoted", label: "Quoted", render: (job) => <span className="tabular-nums">{formatMoney(job.quotedCost)}</span> },
                {
                    key: "actual",
                    label: "Actual",
                    render: (job) => (
                        <span className={cn("tabular-nums", job.costApprovedAt && "font-medium text-foreground")}>
                            {formatMoney(job.actualCost)}
                            {job.costApprovedAt && <span className="ml-1.5 text-xs text-success">approved</span>}
                        </span>
                    ),
                },
                { key: "requested", label: "Requested", render: (job) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(job.requestedAt)}</span> },
                {
                    key: "collected",
                    label: "Collected",
                    render: (job) => <span className="whitespace-nowrap text-muted-foreground">{job.collectedAt ? formatDate(job.collectedAt) : "—"}</span>,
                },
                {
                    key: "moves",
                    label: "From the app",
                    render: (job) => <PartnerMoves job={job} />,
                },
            ]}
        />
    );
}

/** Lot H: what the shop itself did on the job — accepted, declined with its reason, the handover it scanned. */
function PartnerMoves({ job }: { job: PrintJob }) {
    const line = partnerMovesLine(job);
    if (!line) {
        return <span className="text-xs text-muted-foreground">{job.awardedQuoteId ? "Awarded on a quote · nothing yet" : "—"}</span>;
    }
    const when = job.handoverConfirmedAt ?? job.partnerDeclinedAt ?? job.partnerAcceptedAt;
    return (
        <div className="min-w-0 max-w-[18rem]">
            <p className="truncate text-xs text-foreground" title={line}>
                {line}
            </p>
            <p className="text-[11px] text-muted-foreground">
                {[job.awardedQuoteId ? "on a quote" : null, when ? formatDateTime(when) : null].filter(Boolean).join(" · ")}
            </p>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Lot H: the account, the rate card, the invoices                     */
/* ------------------------------------------------------------------ */

function AccountCard({ partner, onActivate, busy, onChanged }: { partner: PrintPartner; onActivate: () => void; busy: boolean; onChanged: () => void }) {
    const state = signInState(partner);
    const [flipping, setFlipping] = React.useState(false);

    /* G13-B: the desk flips the switch for a partner who never activates — the partner's own switch in the app is the same field. */
    async function setAccepts(acceptsQuoteRequests: boolean) {
        setFlipping(true);
        try {
            await printPartnerService.update(partner.id, { acceptsQuoteRequests });
            toast.success(acceptsQuoteRequests ? "Takes quote requests" : "No longer takes quote requests", {
                description: acceptsQuoteRequests
                    ? "An AUTO request in reach invites this shop from now."
                    : "Only a request that names the shop reaches it. Audited on the partner.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change the switch.");
        } finally {
            setFlipping(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">The account</h3>
                <StatusBadge status={SIGN_IN_STATE_META[state]} />
            </div>
            <FieldList
                className="mt-4"
                items={[
                    ["Signs in as", <span key="mobile" className="font-mono text-xs">{partner.mobile}</span>],
                    ["Activated", partner.activatedAt ? formatDateTime(partner.activatedAt) : "Not yet"],
                    ["Activated by", partner.activatedById ? <span key="by" className="font-mono text-xs">{partner.activatedById}</span> : "—"],
                    ["Last sign-in", lastSignInLabel(partner, formatDateTime)],
                    [
                        "Takes quote requests",
                        <label key="accepts" className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">{partner.acceptsQuoteRequests ? "Yes" : "No — rate card or by name only"}</span>
                            <Switch checked={partner.acceptsQuoteRequests} disabled={flipping} onCheckedChange={(on) => void setAccepts(on)} aria-label="Accepts quote requests" />
                        </label>,
                    ],
                ]}
            />
            <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                {state === "ACTIVE"
                    ? "The shop signs in by OTP on this number and runs its jobs from the app. Taking it off the roster switches the app off and ends its sessions."
                    : state === "INVITED"
                      ? "On the roster as a payee only. Activate it so the shop signs in, keeps its rate card and walks its jobs from the app; until then ops record everything here."
                      : partner.activatedAt
                        ? "Off the roster: the app is switched off and every session was ended. Reactivating switches it back on."
                        : "Off the roster and never activated. Reactivate it first, then activate the account."}
            </p>
            {canActivate(partner) && (
                <Button className="mt-4" size="sm" disabled={busy} onClick={onActivate}>
                    <Smartphone className="mr-1.5 size-4" />
                    Activate the account
                </Button>
            )}
        </Card>
    );
}

function RateCardCard({ partner, onChanged }: { partner: PrintPartner; onChanged: () => void }) {
    const { rateCard } = partner;
    const [opening, setOpening] = React.useState(false);
    const [editing, setEditing] = React.useState(false);

    async function open() {
        if (!rateCard.fileUrl) return;
        setOpening(true);
        try {
            await openPrivateFile(rateCard.fileUrl);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The rate card could not be opened.");
        } finally {
            setOpening(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Rate card</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {rateCard.hasRateCard
                            ? `Kept by the shop from the app, or set here on its behalf${rateCard.updatedAt ? ` · updated ${formatDate(rateCard.updatedAt)}` : ""}. A rate-card partner is asked first and wins a tie on a quote.`
                            : partner.acceptsQuoteRequests
                              ? "None yet. The shop takes quote requests instead, and is invited when a request goes out in reach."
                              : "None, and the shop does not take quote requests: it is only reached by name."}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="bg-card" onClick={() => setEditing(true)}>
                        <Pencil className="mr-1.5 size-4" />
                        {rateCard.hasRateCard ? "Replace" : "Set rate card"}
                    </Button>
                    <StatusBadge
                        status={rateCard.hasRateCard ? { label: "Rate card", tone: "success" } : { label: "No rate card", tone: "neutral" }}
                    />
                    <StatusBadge
                        status={
                            partner.acceptsQuoteRequests
                                ? { label: "Accepts quote requests", tone: "info" }
                                : { label: "No quote requests", tone: "neutral" }
                        }
                    />
                </div>
            </div>

            {rateCard.fileUrl && (
                <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr]">
                    <PrivateFile
                        src={rateCard.fileUrl}
                        alt={`${partner.name} rate card`}
                        className="w-full rounded-md border bg-card"
                        frameClassName="aspect-[4/3] rounded-md border"
                    />
                    <div className="text-sm text-muted-foreground">
                        <p>The file the shop uploaded — private, served through the API.</p>
                        <Button variant="outline" size="sm" className="mt-3 bg-card" disabled={opening} onClick={() => void open()}>
                            <ExternalLink className="mr-1.5 size-4" />
                            {opening ? "Opening…" : "Open the file"}
                        </Button>
                    </div>
                </div>
            )}

            {rateCard.rows.length > 0 && (
                <SimpleTable
                    className="mt-4"
                    rows={rateCard.rows.map((row, index) => ({ ...row, key: `${index}-${row.material}` }))}
                    rowKey={(row) => row.key}
                    columns={[
                        { key: "material", label: "Material", render: (row) => <span className="text-foreground">{row.material}</span> },
                        { key: "size", label: "Size class", render: (row) => <span className="text-muted-foreground">{row.sizeClass ?? "—"}</span> },
                        { key: "unit", label: "Per", render: (row) => <span className="text-muted-foreground">{row.unit}</span> },
                        { key: "rate", label: "Rate", render: (row) => <span className="tabular-nums">{formatMoney(row.ratePerUnit)}</span> },
                        { key: "min", label: "Min qty", render: (row) => <span className="tabular-nums text-muted-foreground">{row.minQty ?? "—"}</span> },
                        { key: "notes", label: "Notes", render: (row) => <span className="text-xs text-muted-foreground">{row.notes ?? "—"}</span> },
                    ]}
                />
            )}
            <RateCardDialog
                key={`${partner.id}:${rateCard.updatedAt ?? ""}:${editing}`}
                partner={partner}
                open={editing}
                onOpenChange={setEditing}
                onSaved={onChanged}
            />
        </Card>
    );
}

/** A rate-card row as the dialog holds it: strings, so a half-typed rate is not a NaN. */
interface RowDraft {
    material: string;
    sizeClass: string;
    unit: string;
    ratePerUnit: string;
    minQty: string;
    notes: string;
}

const emptyRow = (): RowDraft => ({ material: "", sizeClass: "", unit: "sq ft", ratePerUnit: "", minQty: "", notes: "" });

const rowDraftOf = (row: RateCardRow): RowDraft => ({
    material: row.material,
    sizeClass: row.sizeClass ?? "",
    unit: row.unit,
    ratePerUnit: row.ratePerUnit,
    minQty: row.minQty === null || row.minQty === undefined ? "" : String(row.minQty),
    notes: row.notes ?? "",
});

const rowOf = (draft: RowDraft): RateCardRow => ({
    material: draft.material.trim(),
    sizeClass: draft.sizeClass.trim() || null,
    unit: draft.unit.trim(),
    ratePerUnit: draft.ratePerUnit.trim(),
    minQty: draft.minQty.trim() ? Number(draft.minQty) : null,
    notes: draft.notes.trim() || null,
});

/**
 * G13-B: the rate card set on the partner's behalf — `PUT
 * /print-partners/:id/rate-card`, `rateCardSchema` exactly: an uploaded
 * PARTNER_RATE_CARD file (kept, replaced, or dropped), structured rows, or
 * both; the server refuses neither. Opens on the card as it stands.
 */
function RateCardDialog({ partner, open, onOpenChange, onSaved }: { partner: PrintPartner; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
    const [rows, setRows] = React.useState<RowDraft[]>(() => (partner.rateCard.rows.length ? partner.rateCard.rows.map(rowDraftOf) : [emptyRow()]));
    const [file, setFile] = React.useState<File | null>(null);
    const [keepFile, setKeepFile] = React.useState(Boolean(partner.rateCard.fileId));
    const [busy, setBusy] = React.useState(false);

    const filled = rows.filter((row) => row.material.trim() || row.ratePerUnit.trim() || row.notes.trim() || row.sizeClass.trim());
    const input = { fileId: file ? "pending" : keepFile ? partner.rateCard.fileId : null, rows: filled.map(rowOf) };
    const problem = rateCardProblem(input);

    const setRow = (index: number, patch: Partial<RowDraft>) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

    async function save() {
        if (problem) {
            toast.error(problem);
            return;
        }
        setBusy(true);
        try {
            const fileId = file ? (await uploadService.upload(file, "PARTNER_RATE_CARD")).id : keepFile ? partner.rateCard.fileId : null;
            await printPartnerService.setRateCard(partner.id, { fileId, rows: filled.map(rowOf) });
            toast.success("Rate card set", { description: `On ${partner.name}'s behalf — audited as such. The shop is now asked first on a request in reach.` });
            onOpenChange(false);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not set the rate card.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{partner.rateCard.hasRateCard ? "Replace the rate card" : "Set the rate card"}</DialogTitle>
                    <DialogDescription>
                        On the shop&rsquo;s behalf — a file, rows, or both. The shop can change it from the app once it signs in; the audit row says ops set this one.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>The file</Label>
                        {partner.rateCard.fileId && !file && (
                            <label className="flex items-center gap-2 text-sm">
                                <Switch checked={keepFile} onCheckedChange={setKeepFile} aria-label="Keep the current file" />
                                Keep the file the card holds now
                            </label>
                        )}
                        <FileDropzone accept={[".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".csv"]} file={file} onFile={setFile} hint="A PDF or an image of the shop's card, or a sheet — private, served through the API." disabled={busy} />
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Rows</Label>
                            <Button type="button" variant="outline" size="sm" className="bg-card" onClick={() => setRows((current) => [...current, emptyRow()])} disabled={rows.length >= 200}>
                                <Plus className="mr-1.5 size-4" />
                                Add row
                            </Button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                        <th className="pb-1 pr-2 font-medium">Material</th>
                                        <th className="pb-1 pr-2 font-medium">Size class</th>
                                        <th className="pb-1 pr-2 font-medium">Per</th>
                                        <th className="pb-1 pr-2 font-medium">Rate (₹)</th>
                                        <th className="pb-1 pr-2 font-medium">Min qty</th>
                                        <th className="pb-1 pr-2 font-medium">Notes</th>
                                        <th className="pb-1" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => (
                                        <tr key={index}>
                                            <td className="py-1 pr-2"><Input value={row.material} onChange={(event) => setRow(index, { material: event.target.value })} placeholder="Flex" maxLength={80} aria-label={`Row ${index + 1} material`} /></td>
                                            <td className="py-1 pr-2"><Input value={row.sizeClass} onChange={(event) => setRow(index, { sizeClass: event.target.value })} placeholder="up to 10 ft" maxLength={60} aria-label={`Row ${index + 1} size class`} /></td>
                                            <td className="py-1 pr-2"><Input value={row.unit} onChange={(event) => setRow(index, { unit: event.target.value })} placeholder="sq ft" maxLength={30} className="w-24" aria-label={`Row ${index + 1} unit`} /></td>
                                            <td className="py-1 pr-2"><Input value={row.ratePerUnit} onChange={(event) => setRow(index, { ratePerUnit: event.target.value })} placeholder="18.00" inputMode="decimal" className="w-24" aria-label={`Row ${index + 1} rate per unit`} /></td>
                                            <td className="py-1 pr-2"><Input value={row.minQty} onChange={(event) => setRow(index, { minQty: event.target.value })} placeholder="—" inputMode="numeric" className="w-20" aria-label={`Row ${index + 1} minimum quantity`} /></td>
                                            <td className="py-1 pr-2"><Input value={row.notes} onChange={(event) => setRow(index, { notes: event.target.value })} maxLength={300} aria-label={`Row ${index + 1} notes`} /></td>
                                            <td className="py-1">
                                                <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${index + 1}`} onClick={() => setRows((current) => current.filter((_, at) => at !== index))}>
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={cn("text-xs", problem ? "text-danger" : "text-muted-foreground")}>{problem ?? "A row is what, per what, at how much; a blank row is left out."}</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={busy || problem !== null}>
                        {busy ? "Saving…" : "Set rate card"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** `2026-08` → "Aug 2026" for the invoices list. */
const monthLabel = (month: string): string => {
    const [year, mm] = month.split("-").map(Number);
    return new Date(Date.UTC(year, mm - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
};

function InvoicesCard({
    partner,
    invoices,
    withMonths,
    latestId,
    onChanged,
}: {
    partner: PrintPartner;
    invoices: (PartnerFile | PartnerInvoice)[];
    /** False when `GET /print-partners/:id/invoices` failed and the ledger's plain list stands in. */
    withMonths: boolean;
    latestId: string | null;
    onChanged: () => void;
}) {
    const [opening, setOpening] = React.useState<string | null>(null);
    const [recording, setRecording] = React.useState(false);

    async function open(file: PartnerFile) {
        setOpening(file.id);
        try {
            await openPrivateFile(file.url);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The invoice could not be opened.");
        } finally {
            setOpening(null);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Invoices</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        The month&rsquo;s invoice to ADX — uploaded by the shop from the app, or recorded here on its behalf. Private files.
                        {!withMonths && " The months could not be read; the files are the ledger's list."}
                    </p>
                </div>
                <Button variant="outline" size="sm" className="bg-card" onClick={() => setRecording(true)}>
                    <Upload className="mr-1.5 size-4" />
                    Record invoice
                </Button>
            </div>
            {invoices.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">None on file yet.</p>
            ) : (
                <ul className="mt-3 divide-y divide-border">
                    {invoices.map((file) => (
                        <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                            <div className="flex min-w-0 items-center gap-3">
                                <FileText className="size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {"month" in file && file.month ? `${monthLabel(file.month)} · ` : ""}
                                        {file.filename}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {[
                                            formatDateTime(file.createdAt),
                                            "recordedBy" in file && file.recordedBy ? (file.recordedBy === "ADMIN" ? "recorded by ops" : "uploaded by the shop") : null,
                                            file.mimeType,
                                            `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {file.id === latestId && <StatusBadge status={{ label: "Latest", tone: "info" }} />}
                                <Button variant="outline" size="sm" className="bg-card" disabled={opening === file.id} onClick={() => void open(file)}>
                                    <ExternalLink className="mr-1.5 size-4" />
                                    {opening === file.id ? "Opening…" : "Open"}
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <RecordInvoiceDialog key={String(recording)} partner={partner} open={recording} onOpenChange={setRecording} onSaved={onChanged} />
        </Card>
    );
}

/** G13-B: an invoice recorded on the partner's behalf — a PARTNER_INVOICE upload and the month it covers, `POST /print-partners/:id/invoices`. */
function RecordInvoiceDialog({ partner, open, onOpenChange, onSaved }: { partner: PrintPartner; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
    const [file, setFile] = React.useState<File | null>(null);
    const [month, setMonth] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const problem = !file ? "Pick the invoice file." : !INVOICE_MONTH_PATTERN.test(month) ? "Pick the month the invoice covers." : null;

    async function save() {
        if (!file || problem) return;
        setBusy(true);
        try {
            const uploaded = await uploadService.upload(file, "PARTNER_INVOICE");
            await printPartnerService.recordInvoice(partner.id, { fileId: uploaded.id, month });
            toast.success(`Invoice for ${monthLabel(month)} recorded`, { description: `On ${partner.name}'s behalf — audited as such.` });
            onOpenChange(false);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not record the invoice.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Record an invoice</DialogTitle>
                    <DialogDescription>For a shop that sends its paper by hand: the file and the month it covers, kept private and audited on the partner.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="invoice-month">Month</Label>
                        <Input id="invoice-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-48" />
                    </div>
                    <FileDropzone accept={[".pdf", ".jpg", ".jpeg", ".png"]} file={file} onFile={setFile} hint="The invoice as a PDF or an image." disabled={busy} />
                </div>
                <DialogFooter>
                    <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={busy || problem !== null} title={problem ?? undefined}>
                        {busy ? "Recording…" : "Record invoice"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Lot H: quotes                                                       */
/* ------------------------------------------------------------------ */

function QuotesTable({ quotes }: { quotes: PartnerQuoteHistoryRow[] | null }) {
    if (quotes === null) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    The quote history could not be read — the quotes feature may be off for this operator.
                </p>
            </Card>
        );
    }
    return (
        <SimpleTable<PartnerQuoteHistoryRow>
            rows={quotes}
            rowKey={(row) => row.id}
            emptyMessage="This shop has not quoted on a request yet. Requests go out from an order's Printing card."
            columns={[
                {
                    key: "order",
                    label: "Order",
                    render: (row) => (
                        <Link href={`/orders/${row.orderId}`} className="font-mono text-xs underline-offset-4 hover:underline">
                            {shortId(row.orderId, "ORD-")}
                        </Link>
                    ),
                },
                { key: "amount", label: "Quoted", render: (row) => <span className="tabular-nums text-foreground">{formatMoney(row.amount)}</span> },
                { key: "turnaround", label: "Turnaround", render: (row) => <span className="text-muted-foreground">{row.turnaroundDays} days</span> },
                {
                    key: "status",
                    label: "Quote",
                    render: (row) => (
                        <div className="flex items-center gap-1.5">
                            <StatusBadge status={QUOTE_STATUS_META[row.status]} />
                            {row.request.awarded && <StatusBadge status={{ label: "Won", tone: "success" }} />}
                        </div>
                    ),
                },
                {
                    key: "request",
                    label: "Request",
                    render: (row) => (
                        <div className="min-w-0">
                            <StatusBadge status={QUOTE_REQUEST_STATUS_META[row.request.status]} />
                            <p className="mt-0.5 text-[11px] text-muted-foreground">deadline {formatDateTime(row.request.deadlineAt)}</p>
                        </div>
                    ),
                },
                { key: "submitted", label: "Quoted on", render: (row) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.submittedAt)}</span> },
                { key: "note", label: "Note", render: (row) => <span className="text-xs text-muted-foreground">{row.note ?? "—"}</span> },
            ]}
        />
    );
}

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

function WalletTab({
    ledger,
    methods,
    mayEdit,
    onAddMethod,
    onWithdraw,
}: {
    ledger: PrintPartnerLedger;
    methods: PayoutMethod[] | null;
    mayEdit: boolean;
    onAddMethod: () => void;
    onWithdraw: () => void;
}) {
    const { balances, entries, withdrawals, walletId } = ledger;
    const verified = (methods ?? []).filter((method) => method.status === "VERIFIED");
    const canWithdraw = mayEdit && walletId !== null && verified.length > 0 && compareMoney(balances?.withdrawable, "0") > 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Approved print costs land here net of TDS. The shop is paid by NEFT: record its bank account, raise the
                    withdrawal on its behalf, and finance releases it from the{" "}
                    <Link href="/finance" className="underline underline-offset-4">
                        withdrawal queue
                    </Link>
                    {walletId && (
                        <>
                            {" "}
                            —{" "}
                            <Link href={`/finance/wallets/${walletId}`} className="underline underline-offset-4">
                                open the wallet
                            </Link>
                        </>
                    )}
                    .
                </p>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="bg-card" onClick={onAddMethod} disabled={methods === null}>
                        <Plus className="mr-1.5 size-4" />
                        Add payout method
                    </Button>
                    <Button
                        onClick={onWithdraw}
                        disabled={!canWithdraw}
                        title={
                            !mayEdit
                                ? "Needs the finance.edit permission."
                                : verified.length === 0
                                  ? "Needs a verified payout method first."
                                  : compareMoney(balances?.withdrawable, "0") <= 0
                                    ? "Nothing is withdrawable yet."
                                    : undefined
                        }
                    >
                        <Send className="mr-1.5 size-4" />
                        Raise withdrawal
                    </Button>
                </div>
            </div>

            {balances?.frozenAt && (
                <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none">
                    <p className="text-sm font-medium text-foreground">Wallet frozen since {formatDate(balances.frozenAt)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {balances.frozenReason ?? "Money lands; nothing leaves until the freeze is lifted."}
                    </p>
                </Card>
            )}

            <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
                {[
                    { label: "Balance", value: balances?.balance, hint: "credits less debits" },
                    { label: "Pending clearance", value: balances?.pendingClearance, hint: "inside the clearing window" },
                    { label: "Open withdrawals", value: balances?.openWithdrawals, hint: "asked for, not yet paid" },
                    { label: "Withdrawable", value: balances?.withdrawable, hint: "what may be raised now" },
                ].map((figure) => (
                    <div key={figure.label} className="bg-card p-4">
                        <p className="text-xs text-muted-foreground">{figure.label}</p>
                        <p className="mt-1 text-base font-medium tabular-nums text-foreground">{formatMoney(figure.value ?? "0.00")}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{figure.hint}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Payout methods</h3>
                    {methods === null ? (
                        <p className="mt-3 text-sm text-muted-foreground">Read from the finance API, which the console is not connected to.</p>
                    ) : methods.length === 0 ? (
                        <div className="mt-3 flex items-start gap-3">
                            <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
                            <p className="text-sm text-muted-foreground">
                                No bank account on file. Nothing can be paid to this shop until one is recorded and verified on the{" "}
                                <Link href="/finance/payout-methods" className="underline underline-offset-4">
                                    payout methods
                                </Link>{" "}
                                queue.
                            </p>
                        </div>
                    ) : (
                        <ul className="mt-3 divide-y divide-border">
                            {methods.map((method) => (
                                <li key={method.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{describeMethod(method)}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {[method.accountHolder, method.ifscCode, `added ${formatDate(method.createdAt)}`].filter(Boolean).join(" · ")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {method.isDefault && <StatusBadge status={{ label: "Default", tone: "info" }} />}
                                        <StatusBadge status={PAYOUT_METHOD_STATUS_META[method.status]} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-base font-semibold text-foreground">Withdrawals</h3>
                    {withdrawals.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">None raised yet.</p>
                    ) : (
                        <ul className="mt-3 divide-y divide-border">
                            {withdrawals.map((row) => (
                                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {formatMoney(row.netAmount)}{" "}
                                            <span className="font-mono text-xs text-muted-foreground">{row.reference}</span>
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {[
                                                formatDate(row.requestedAt),
                                                row.rail ? RAIL_LABEL[row.rail] : null,
                                                row.railReference ? `UTR ${row.railReference}` : null,
                                                row.paidAt ? `paid ${formatDate(row.paidAt)}` : null,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </p>
                                    </div>
                                    <StatusBadge status={WITHDRAWAL_STATUS_META[row.status]} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-base font-semibold text-foreground">Statement</h3>
                {entries.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nothing has moved through this wallet yet.</p>
                ) : (
                    <ul className="mt-3 divide-y divide-border">
                        {entries.map((entry) => {
                            const credit = !entry.amount.startsWith("-");
                            return (
                                <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm text-foreground">{ENTRY_TYPE_LABEL[entry.type] ?? entry.type}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {entry.orderId ? (
                                                <Link href={`/orders/${entry.orderId}`} className="underline-offset-4 hover:underline">
                                                    Order {shortId(entry.orderId, "ORD-")}
                                                </Link>
                                            ) : (
                                                (entry.note ?? entry.reference ?? "—")
                                            )}
                                            {entry.orderId && entry.note ? ` · ${entry.note}` : ""}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className={cn("text-sm font-medium tabular-nums", credit ? "text-success" : "text-foreground")}>
                                            {credit ? "+" : ""}
                                            {formatMoney(entry.amount)}
                                        </p>
                                        <p className="text-[11px] tabular-nums text-muted-foreground">{formatMoney(entry.balanceAfter)}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Raise withdrawal                                                    */
/* ------------------------------------------------------------------ */

function RaiseWithdrawalDialog({
    open,
    onOpenChange,
    walletId,
    partnerName,
    withdrawable,
    methods,
    onRaised,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    walletId: string;
    partnerName: string;
    withdrawable: string;
    /** VERIFIED methods only; the partner's default is preselected. */
    methods: PayoutMethod[];
    onRaised: () => void;
}) {
    const [amount, setAmount] = React.useState("");
    const [methodId, setMethodId] = React.useState(methods.find((method) => method.isDefault)?.id ?? methods[0]?.id ?? "");
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const valid = AMOUNT.test(amount.trim()) && compareMoney(amount.trim(), "0") > 0 && compareMoney(amount.trim(), withdrawable) <= 0;

    async function raise() {
        setBusy(true);
        try {
            const created = await financeService.requestWithdrawalOnBehalf({
                walletId,
                amount: amount.trim(),
                ...(methodId ? { payoutMethodId: methodId } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            toast.success(`${created.reference} raised for ${partnerName}`, {
                description: "REQUESTED on the withdrawal queue. Finance approves it, then releases it in a batch or marks it paid with the UTR.",
            });
            setAmount("");
            setNote("");
            onOpenChange(false);
            onRaised();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The withdrawal did not reach ADX.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Raise a withdrawal</DialogTitle>
                    <DialogDescription>
                        On {partnerName}&apos;s behalf — the shop cannot sign in to ask. The minimum, the daily cap and
                        the cleared balance apply exactly as they would to its own request.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="withdraw-amount">Amount</Label>
                        <Input
                            id="withdraw-amount"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder={withdrawable}
                            className="tabular-nums"
                        />
                        <p className="text-xs text-muted-foreground">Withdrawable now: {formatMoney(withdrawable)}.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="withdraw-method">Pay to</Label>
                        <Select value={methodId} onValueChange={setMethodId}>
                            <SelectTrigger id="withdraw-method">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {methods.map((method) => (
                                    <SelectItem key={method.id} value={method.id}>
                                        {describeMethod(method)}
                                        {method.isDefault ? " · default" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="withdraw-note">Note</Label>
                        <Textarea
                            id="withdraw-note"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="Which jobs this settles. Optional; kept on the audit row."
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void raise()} disabled={busy || !valid || !methodId}>
                        {busy ? "Raising…" : "Raise withdrawal"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
