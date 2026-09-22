"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    FLAG_META,
    FLAG_STATUS_TONE,
    LEAD_FLAG_KINDS,
    integrityService,
    qaEvidenceLine,
    type LeadFlag,
    type LeadFlagKind,
    type LeadFlagStatus,
    type LeadFlagsPage,
    type QaSample,
    type QaVerdict,
} from "@/services/leads";

/**
 * LH10: the integrity desk — the scan's flags on the left of the day, the
 * sampled field work on the right.
 *
 * Nothing on this page punishes anybody. A flag is a pattern the platform
 * saw; the desk confirms it (which is what counts against the agent's
 * quality score) or dismisses it, once, with a note. A QA sample carries
 * what the evidence said; ops may overrule it, and then they must say why.
 */

export interface IntegrityFilter {
    status: LeadFlagStatus | "ALL";
    kind: LeadFlagKind | "ALL";
}

export function IntegrityView({
    flags,
    samples,
    filter,
    onFilter,
    onChanged,
}: {
    flags: LeadFlagsPage;
    samples: { items: QaSample[]; total: number };
    filter: IntegrityFilter;
    onFilter: (filter: IntegrityFilter) => void;
    onChanged: () => void;
}) {
    const [deciding, setDeciding] = React.useState<{ flag: LeadFlag; status: "CONFIRMED" | "DISMISSED" } | null>(null);
    const [reviewing, setReviewing] = React.useState<{ sample: QaSample; verdict: QaVerdict } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const openTotal = Object.values(flags.openByKind).reduce((sum, n) => sum + n, 0);
    const kindChips = [
        { value: "ALL", label: `All kinds · ${openTotal}` },
        ...LEAD_FLAG_KINDS.map((kind) => ({ value: kind, label: `${FLAG_META[kind].label} · ${flags.openByKind[kind] ?? 0}` })),
    ];

    async function run(work: () => Promise<unknown>) {
        setBusy(true);
        setError(null);
        try {
            await work();
            onChanged();
            setDeciding(null);
            setReviewing(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5" data-testid="integrity-desk">
            <PageHeader
                title="Integrity"
                subtitle="What the hourly scan saw, and the field work the nightly draw sampled. A flag is a pattern, not a verdict — confirming one is what counts against the agent's quality score."
                actions={
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => integrityService.scan())} data-testid="integrity-scan">
                            Scan now
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => integrityService.sample())} data-testid="integrity-sample">
                            Draw a sample
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => integrityService.runClawbacks())} data-testid="integrity-clawbacks">
                            Run clawbacks
                        </Button>
                    </div>
                }
            />

            {error ? (
                <p className="text-sm text-danger" data-testid="integrity-error">
                    {error}
                </p>
            ) : null}

            <div className="space-y-2">
                <FilterChips
                    chips={[
                        { value: "OPEN", label: "Open" },
                        { value: "CONFIRMED", label: "Confirmed" },
                        { value: "DISMISSED", label: "Dismissed" },
                        { value: "ALL", label: "Everything" },
                    ]}
                    value={filter.status}
                    onChange={(value) => onFilter({ ...filter, status: value as LeadFlagStatus | "ALL" })}
                />
                <FilterChips chips={kindChips} value={filter.kind} onChange={(value) => onFilter({ ...filter, kind: value as LeadFlagKind | "ALL" })} />
            </div>

            <SectionCard title={`${flags.total} ${flags.total === 1 ? "flag" : "flags"}`} description="Each one is a fact the scan could check. The detail says what it saw; the evidence rides the row.">
                {flags.items.length === 0 ? (
                    <EmptyState icon={ShieldCheck} title="Nothing flagged" description="The scan found none of the four patterns under this filter." className="py-12" />
                ) : (
                    <SimpleTable<LeadFlag>
                        rows={flags.items}
                        rowKey={(row) => row.id}
                        columns={[
                            {
                                key: "lead",
                                label: "Lead",
                                render: (row) => (
                                    <Link href={`/leads/${row.leadId}`} className="font-medium text-primary hover:underline" data-testid={`integrity-open-${row.leadId}`}>
                                        {row.businessName}
                                        {row.displayId ? <span className="ml-1 text-xs font-normal text-muted-foreground">{row.displayId}</span> : null}
                                    </Link>
                                ),
                            },
                            {
                                key: "kind",
                                label: "Pattern",
                                render: (row) => (
                                    <span title={FLAG_META[row.kind as LeadFlagKind]?.hint ?? ""} data-testid={`integrity-kind-${row.id}`}>
                                        {row.label}
                                    </span>
                                ),
                            },
                            { key: "detail", label: "What it saw", render: (row) => <span className="text-sm text-muted-foreground">{row.detail}</span> },
                            {
                                key: "agent",
                                label: "Agent",
                                render: (row) => (row.agentId ? <Link href={`/agents/${row.agentId}`} className="text-primary hover:underline">{row.agentId}</Link> : <span className="text-muted-foreground">—</span>),
                            },
                            { key: "opened", label: "Opened", render: (row) => formatDateTime(row.openedAt) },
                            { key: "status", label: "Status", render: (row) => <StatusBadge status={{ label: row.status.toLowerCase(), tone: FLAG_STATUS_TONE[row.status] ?? "neutral" }} /> },
                            {
                                key: "decide",
                                label: "",
                                render: (row) =>
                                    row.status === "OPEN" ? (
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => setDeciding({ flag: row, status: "DISMISSED" })} data-testid={`integrity-dismiss-${row.id}`}>
                                                Dismiss
                                            </Button>
                                            <Button size="sm" onClick={() => setDeciding({ flag: row, status: "CONFIRMED" })} data-testid={`integrity-confirm-${row.id}`}>
                                                Confirm
                                            </Button>
                                        </div>
                                    ) : (
                                        <span className="block text-right text-xs text-muted-foreground" data-testid={`integrity-decided-${row.id}`}>
                                            {row.note ?? (row.decidedAt ? formatDateTime(row.decidedAt) : "—")}
                                        </span>
                                    ),
                            },
                        ]}
                    />
                )}
            </SectionCard>

            <SectionCard
                title={`${samples.total} sampled ${samples.total === 1 ? "piece" : "pieces"} of field work`}
                description="One in five completed visits and one in ten recorded calls. The verdict is what the evidence says until somebody looks."
            >
                {samples.items.length === 0 ? (
                    <EmptyState icon={ShieldCheck} title="Nothing sampled yet" description="The nightly draw takes its share of yesterday's visits and recorded calls." className="py-12" />
                ) : (
                    <SimpleTable<QaSample>
                        rows={samples.items}
                        rowKey={(row) => row.id}
                        columns={[
                            { key: "kind", label: "What", render: (row) => <span className="text-foreground">{row.kind === "CALL" ? "Call" : "Visit"}</span> },
                            {
                                key: "agent",
                                label: "Agent",
                                render: (row) => (
                                    <Link href={`/agents/${row.agentId}`} className="text-primary hover:underline">
                                        {row.agentId}
                                    </Link>
                                ),
                            },
                            { key: "evidence", label: "Evidence", render: (row) => <span className="text-sm text-muted-foreground" data-testid={`qa-evidence-${row.id}`}>{qaEvidenceLine(row)}</span> },
                            {
                                key: "verdict",
                                label: "Verdict",
                                render: (row) => (
                                    <StatusBadge
                                        status={{
                                            label: row.verdict ? `${row.verdict.toLowerCase()} (reviewed)` : `${row.autoVerdict.toLowerCase()} (auto)`,
                                            tone: (row.verdict ?? row.autoVerdict) === "PASS" ? "success" : "danger",
                                        }}
                                    />
                                ),
                            },
                            { key: "sampled", label: "Sampled", render: (row) => formatDateTime(row.sampledAt) },
                            {
                                key: "review",
                                label: "",
                                render: (row) => (
                                    <div className="flex justify-end gap-2">
                                        <Button size="sm" variant="outline" onClick={() => setReviewing({ sample: row, verdict: "FAIL" })} data-testid={`qa-fail-${row.id}`}>
                                            Fail
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setReviewing({ sample: row, verdict: "PASS" })} data-testid={`qa-pass-${row.id}`}>
                                            Pass
                                        </Button>
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
            </SectionCard>

            {/* Keyed by what is being decided, so each one opens with an empty note rather than resetting state inside an effect. */}
            {deciding ? (
                <DecideDialog
                    key={`${deciding.flag.id}:${deciding.status}`}
                    deciding={deciding}
                    busy={busy}
                    onClose={() => setDeciding(null)}
                    onDecide={(note) => void run(() => integrityService.decide(deciding.flag.id, { status: deciding.status, ...(note ? { note } : {}) }))}
                />
            ) : null}
            {reviewing ? (
                <ReviewDialog
                    key={`${reviewing.sample.id}:${reviewing.verdict}`}
                    reviewing={reviewing}
                    busy={busy}
                    onClose={() => setReviewing(null)}
                    onReview={(note) => void run(() => integrityService.review(reviewing.sample.id, { verdict: reviewing.verdict, ...(note ? { note } : {}) }))}
                />
            ) : null}
        </div>
    );
}

function DecideDialog({ deciding, busy, onClose, onDecide }: { deciding: { flag: LeadFlag; status: "CONFIRMED" | "DISMISSED" }; busy: boolean; onClose: () => void; onDecide: (note: string) => void }) {
    const [note, setNote] = React.useState("");
    const confirming = deciding.status === "CONFIRMED";
    return (
        <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
            <DialogContent data-testid="integrity-decide-dialog">
                <DialogHeader>
                    <DialogTitle>{confirming ? "Confirm this flag" : "Dismiss this flag"}</DialogTitle>
                    <DialogDescription>
                        {confirming
                            ? "A confirmed flag counts against the agent's quality score for ninety days. It suspends nobody and moves no money."
                            : "A dismissed flag stays on the record as looked-at, and the scan will not raise it again."}
                    </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">{deciding.flag.detail}</p>
                <div className="space-y-1.5">
                    <Label htmlFor="integrity-note">Note</Label>
                    <Textarea id="integrity-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you found when you looked" rows={3} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => onDecide(note.trim())} disabled={busy} data-testid="integrity-decide-submit">
                        {confirming ? "Confirm" : "Dismiss"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ReviewDialog({ reviewing, busy, onClose, onReview }: { reviewing: { sample: QaSample; verdict: QaVerdict }; busy: boolean; onClose: () => void; onReview: (note: string) => void }) {
    const [note, setNote] = React.useState("");
    const overruling = reviewing.verdict !== reviewing.sample.autoVerdict;
    return (
        <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
            <DialogContent data-testid="qa-review-dialog">
                <DialogHeader>
                    <DialogTitle>{reviewing.verdict === "PASS" ? "Pass this sample" : "Fail this sample"}</DialogTitle>
                    <DialogDescription>
                        {overruling
                            ? `The evidence reads ${reviewing.sample.autoVerdict.toLowerCase()}. Say why it reads differently to you — the note is the record.`
                            : "This agrees with the evidence. A note is welcome but not needed."}
                    </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground" data-testid="qa-review-evidence">
                    {qaEvidenceLine(reviewing.sample)}
                </p>
                <div className="space-y-1.5">
                    <Label htmlFor="qa-note">Note</Label>
                    <Textarea id="qa-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={overruling ? "Required — what the evidence misses" : "Optional"} rows={3} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => onReview(note.trim())} disabled={busy || (overruling && !note.trim())} data-testid="qa-review-submit">
                        Save the verdict
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
