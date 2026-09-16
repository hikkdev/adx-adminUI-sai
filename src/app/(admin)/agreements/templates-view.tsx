"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge, TrafficLight } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    AGREEMENT_KINDS,
    KINDS_FOR_PARTY,
    KIND_META,
    PARTY_LABEL,
    PARTY_TYPES,
    TEMPLATE_STATE_META,
    agreementService,
    kindCoverage,
    versionLabel,
    versionsOf,
    type AgreementKind,
    type AgreementTemplate,
} from "@/services/agreements";
import { TemplateEditor, type EditorTarget } from "./template-editor";
import { TemplateTextDialog } from "./template-text-dialog";

interface TemplatesViewProps {
    templates: AgreementTemplate[];
    onChanged: () => void;
}

type Pending = { action: "activate" | "discard"; template: AgreementTemplate } | null;

/**
 * The templates screen: the four kinds down the left, the chosen kind's live
 * version and every other version on the right.
 *
 * Laid out like DR 10's Settings — a rail of sections and a stack of cards —
 * because that is what this is: four things ops configure, each with a
 * history. The rail says at a glance which kinds have nothing live, which is
 * the state both personas are stalled in today.
 */
export function TemplatesView({ templates, onChanged }: TemplatesViewProps) {
    const coverage = React.useMemo(() => kindCoverage(templates), [templates]);
    // Opens on the publisher platform terms every time. Opening on "the first
    // stalled kind" looked helpful and was not: with the publisher terms live
    // and the advertiser terms unwritten, the desk opened on an empty panel
    // while the rail said "v2 live" beside it. The stalled kinds are marked in
    // the rail, which is where a reviewer looks for them.
    const [kind, setKind] = React.useState<AgreementKind>("PLATFORM");
    const [editor, setEditor] = React.useState<EditorTarget | null>(null);
    const [reading, setReading] = React.useState<AgreementTemplate | null>(null);
    const [pending, setPending] = React.useState<Pending>(null);
    const [busy, setBusy] = React.useState(false);
    /* Lot D (Q55): the switch on the activate dialog. Null until the dialog
       opens on a draft; the stored value stands for a retired version, whose
       text and flags are frozen. */
    const [reacceptance, setReacceptance] = React.useState<boolean | null>(null);

    const meta = KIND_META[kind];
    const party = PARTY_LABEL[meta.party];
    const versions = versionsOf(templates, kind);
    const live = coverage[kind].live;
    const nextVersion = (versions[0]?.version ?? 0) + 1;

    const openCreate = () =>
        setEditor({ mode: "create", kind, nextVersion, hasLive: live !== null });

    async function run(target: NonNullable<Pending>) {
        setBusy(true);
        try {
            if (target.action === "activate") {
                // E7-3: the switch travels in the activate body and is applied
                // in the same transaction, so the version goes live saying what
                // was chosen — no separate PATCH ahead of it.
                const withSwitch = meta.scope === "PLATFORM" && reacceptance !== null && reacceptance !== target.template.requiresReacceptance;
                await agreementService.activate(target.template.id, withSwitch ? { requiresReacceptance: reacceptance } : {});
                const enforced = reacceptance ?? target.template.requiresReacceptance;
                toast.success(`${meta.label} ${versionLabel(target.template)} is live`, {
                    description: live
                        ? `${versionLabel(live)} is retired. Its acceptances stay on record${enforced ? `; every ${party.singular.toLowerCase()} accepts again before transacting` : ""}.`
                        : `${party.plural} can accept it from now on.`,
                });
            } else {
                await agreementService.discard(target.template.id);
                toast.success(`Draft ${versionLabel(target.template)} discarded`);
            }
            setPending(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not update the agreement.");
        } finally {
            setBusy(false);
        }
    }

    const columns: SimpleColumn<AgreementTemplate>[] = [
        {
            key: "version",
            label: "Version",
            className: "w-20",
            render: (row) => <span className="font-medium tabular-nums">{versionLabel(row)}</span>,
        },
        {
            key: "title",
            label: "Title",
            render: (row) => (
                <div className="min-w-0">
                    <button
                        type="button"
                        onClick={() => setReading(row)}
                        className="truncate text-left font-medium text-foreground hover:underline"
                    >
                        {row.title}
                    </button>
                    {row.changeNote && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.changeNote}</p>
                    )}
                </div>
            ),
        },
        {
            key: "state",
            label: "State",
            className: "w-24",
            render: (row) => <StatusBadge status={TEMPLATE_STATE_META[row.state]} />,
        },
        {
            key: "live",
            label: "Live",
            className: "w-44 whitespace-nowrap",
            render: (row) =>
                row.activatedAt ? (
                    <span className="text-muted-foreground">
                        {formatDate(row.activatedAt)}
                        {row.retiredAt ? ` → ${formatDate(row.retiredAt)}` : " → now"}
                    </span>
                ) : (
                    <span className="text-muted-foreground">Never</span>
                ),
        },
        {
            key: "acceptances",
            label: "Acceptances",
            className: "w-28 text-right",
            render: (row) => (
                <span className="tabular-nums">
                    {row.acceptanceCount > 0 ? (
                        <Link
                            href={`/agreements/acceptances?templateId=${row.id}`}
                            className="text-foreground hover:underline"
                        >
                            {row.acceptanceCount}
                        </Link>
                    ) : (
                        <span className="text-muted-foreground">0</span>
                    )}
                </span>
            ),
        },
        {
            key: "actions",
            label: "",
            className: "w-56 text-right",
            render: (row) => (
                <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setReading(row)}>
                        View
                    </Button>
                    {row.state === "DRAFT" && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditor({ mode: "edit", template: row })}
                        >
                            Edit
                        </Button>
                    )}
                    {row.state !== "ACTIVE" && (
                        <Button
                            size="sm"
                            variant={row.state === "DRAFT" ? "default" : "outline"}
                            onClick={() => {
                                setReacceptance(row.requiresReacceptance);
                                setPending({ action: "activate", template: row });
                            }}
                        >
                            {row.state === "SUPERSEDED" ? "Bring back" : "Activate"}
                        </Button>
                    )}
                    {row.state === "DRAFT" && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger hover:text-danger"
                            onClick={() => setPending({ action: "discard", template: row })}
                        >
                            Discard
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
            {/* Rail: the four kinds, grouped by who signs them. */}
            <nav className="space-y-5" aria-label="Agreement kinds">
                {PARTY_TYPES.map((partyType) => (
                    <div key={partyType}>
                        <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {PARTY_LABEL[partyType].singular}
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                            {KINDS_FOR_PARTY[partyType].map((item) => {
                                const active = item === kind;
                                const cover = coverage[item];
                                return (
                                    <li key={item}>
                                        <button
                                            type="button"
                                            onClick={() => setKind(item)}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                                                active
                                                    ? "bg-muted font-medium text-foreground"
                                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                            )}
                                        >
                                            <TrafficLight
                                                tone={cover.live ? "success" : cover.stalled ? "danger" : "warning"}
                                                className="mt-1.5"
                                            />
                                            <span className="min-w-0">
                                                <span className="block">{KIND_META[item].label}</span>
                                                <span className="block text-xs font-normal text-muted-foreground">
                                                    {cover.live
                                                        ? `${versionLabel(cover.live)} live`
                                                        : cover.drafts > 0
                                                          ? `${cover.drafts} draft${cover.drafts === 1 ? "" : "s"}, nothing live`
                                                          : "Nothing live"}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            {/* The chosen kind. */}
            <div className="min-w-0 space-y-4">
                <SectionCard
                    title={meta.label}
                    description={meta.gate}
                    actions={
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="size-4" />
                            New version
                        </Button>
                    }
                    contentClassName="space-y-4"
                >
                    {live ? (
                        <Card className="flex flex-wrap items-center justify-between gap-4 rounded-lg border-success/30 bg-success-soft/40 p-4 shadow-none">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={TEMPLATE_STATE_META.ACTIVE} />
                                    <span className="text-sm font-semibold text-foreground">
                                        {versionLabel(live)} · {live.title}
                                    </span>
                                    {live.requiresReacceptance && (
                                        <StatusBadge status={{ label: "Requires re-acceptance", tone: "warning" }} />
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Live since {live.activatedAt ? formatDate(live.activatedAt) : formatDate(live.effectiveFrom)}
                                    {" · "}
                                    {live.acceptanceCount === 1 ? "1 acceptance" : `${live.acceptanceCount} acceptances`}
                                    {" · "}
                                    every {party.singular.toLowerCase()} accepting now accepts this text
                                </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setReading(live)}>
                                <FileText className="size-4" />
                                Read the text
                            </Button>
                        </Card>
                    ) : (
                        <Card
                            className={cn(
                                "flex flex-wrap items-center justify-between gap-4 rounded-lg p-4 shadow-none",
                                coverage[kind].stalled
                                    ? "border-danger/40 bg-danger-soft"
                                    : "border-warning/40 bg-warning-soft"
                            )}
                        >
                            <div className="flex min-w-0 items-start gap-3">
                                <AlertTriangle
                                    className={cn("mt-0.5 size-4 shrink-0", coverage[kind].stalled ? "text-danger" : "text-warning")}
                                    aria-hidden
                                />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">Nothing is live</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {coverage[kind].stalled
                                            ? `${party.plural} cannot get past their agreement gate until a version is activated. The API answers NO_ACTIVE_TEMPLATE to every attempt.`
                                            : meta.scope === "TRANSACTION"
                                              ? `No ${meta.label.toLowerCase()} can be accepted until a version is activated.`
                                              : ""}
                                        {versions.length > 0 && " Activate a draft below, or write a new version."}
                                    </p>
                                </div>
                            </div>
                            <Button size="sm" onClick={openCreate}>
                                <Plus className="size-4" />
                                {versions.length > 0 ? "New version" : "Write the first version"}
                            </Button>
                        </Card>
                    )}

                    <SimpleTable
                        columns={columns}
                        rows={versions}
                        rowKey={(row) => row.id}
                        emptyMessage={`No version of the ${meta.label.toLowerCase()} has been written yet.`}
                    />
                </SectionCard>

                <p className="text-xs text-muted-foreground">
                    A version that has been live is frozen: it is what people accepted, and their acceptance
                    points at it. Going live retires the previous version; whether anybody is asked to accept
                    again is the version&rsquo;s own switch, and the Stale terms tab shows who is behind.
                </p>
            </div>

            <TemplateEditor target={editor} onOpenChange={(open) => !open && setEditor(null)} onSaved={onChanged} />
            <TemplateTextDialog template={reading} onOpenChange={(open) => !open && setReading(null)} />

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && !busy && setPending(null)}
                title={
                    pending?.action === "discard"
                        ? `Discard draft ${pending ? versionLabel(pending.template) : ""}?`
                        : `Make ${pending ? versionLabel(pending.template) : ""} the live ${meta.label.toLowerCase()}?`
                }
                description={
                    pending?.action === "discard"
                        ? "The draft is deleted. Nobody has accepted it, so nothing else changes. The next version keeps counting from the highest that remains."
                        : live
                          ? `Every ${party.singular.toLowerCase()} accepting from now on accepts ${pending ? versionLabel(pending.template) : "this"} instead of ${versionLabel(live)}. ${versionLabel(live)} is retired and stays on record for the people who accepted it.`
                          : `Nothing is live today. ${party.plural} can accept ${pending ? versionLabel(pending.template) : "this"} from the moment it is activated.`
                }
                confirmLabel={pending?.action === "discard" ? "Discard draft" : "Make it live"}
                destructive={pending?.action === "discard"}
                busy={busy}
                onConfirm={() => pending && run(pending)}
            >
                {pending?.action === "activate" && meta.scope === "PLATFORM" && (
                    <label className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
                        <span>
                            <span className="block text-sm font-medium text-foreground">Requires re-acceptance</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                {pending.template.state === "DRAFT"
                                    ? `On, every ${party.singular.toLowerCase()} clicks again before transacting and the stale report lists them as blocked. Off, an earlier acceptance still clears the gate.`
                                    : "Set when this version was written; a version that has been live is frozen, this switch included."}
                            </span>
                        </span>
                        <Switch
                            checked={reacceptance ?? pending.template.requiresReacceptance}
                            onCheckedChange={setReacceptance}
                            disabled={busy || pending.template.state !== "DRAFT"}
                            aria-label="Requires re-acceptance"
                        />
                    </label>
                )}
            </ConfirmDialog>
        </div>
    );
}
