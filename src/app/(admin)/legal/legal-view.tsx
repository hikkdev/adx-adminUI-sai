"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { formatDateTime } from "@/lib/format";
import {
    DOCUMENT_STATE_META,
    LEGAL_KIND_META,
    LEGAL_KIND_ORDER,
    isPlaceholder,
    kindCoverage,
    legalService,
    placeholderCount,
    versionLabel,
    versionsOf,
    type LegalDocument,
    type LegalKind,
} from "@/services/legal";
import { DocumentEditor, type EditorTarget } from "./document-editor";

interface LegalViewProps {
    documents: LegalDocument[];
    onChanged: () => void;
}

type Pending = { action: "activate" | "discard"; document: LegalDocument } | null;

/**
 * The read documents: the kinds down the left, the chosen kind's live version
 * and its history on the right.
 *
 * Laid out like the agreements screen because it is the same shape of work —
 * versioned text ops write and publish — with one addition the agreements
 * screen does not need: every kind is seeded with a placeholder so the apps
 * have something to show, and the rail marks which are still on one. That
 * count is the launch blocker, and it is the first thing this screen says.
 */
export function LegalView({ documents, onChanged }: LegalViewProps) {
    const coverage = React.useMemo(() => kindCoverage(documents), [documents]);
    const [kind, setKind] = React.useState<LegalKind>("PRIVACY_POLICY");
    const [editor, setEditor] = React.useState<EditorTarget | null>(null);
    const [pending, setPending] = React.useState<Pending>(null);
    const [busy, setBusy] = React.useState(false);

    const meta = LEGAL_KIND_META[kind];
    const versions = versionsOf(documents, kind);
    const live = coverage[kind].live;
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    const outstanding = placeholderCount(documents);

    async function run(target: NonNullable<Pending>) {
        setBusy(true);
        try {
            if (target.action === "activate") {
                await legalService.activate(target.document.id);
                toast.success(`${meta.label} ${versionLabel(target.document)} is live`, {
                    description: "Both apps read it on their next open.",
                });
            } else {
                await legalService.discard(target.document.id);
                toast.success(`Draft ${versionLabel(target.document)} discarded`);
            }
            setPending(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not update the document.");
        } finally {
            setBusy(false);
        }
    }

    const columns: SimpleColumn<LegalDocument>[] = [
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
                        onClick={() => setEditor({ mode: "read", document: row })}
                        className="truncate text-left font-medium text-foreground hover:underline"
                    >
                        {row.title}
                    </button>
                    {row.changeNote && <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.changeNote}</p>}
                </div>
            ),
        },
        {
            key: "state",
            label: "State",
            className: "w-28",
            render: (row) => <StatusBadge status={DOCUMENT_STATE_META[row.state]} />,
        },
        {
            key: "live",
            label: "Live",
            className: "w-44 whitespace-nowrap",
            render: (row) => (row.activatedAt ? <span className="text-muted-foreground">{formatDateTime(row.activatedAt)}</span> : <span className="text-muted-foreground">—</span>),
        },
        {
            key: "actions",
            label: "",
            className: "w-52 text-right",
            render: (row) => (
                <div className="flex justify-end gap-2">
                    {row.state === "DRAFT" && (
                        <>
                            <Button variant="outline" size="sm" className="bg-card" onClick={() => setEditor({ mode: "edit", document: row })}>
                                Edit
                            </Button>
                            <Button variant="outline" size="sm" className="bg-card text-danger hover:text-danger" onClick={() => setPending({ action: "discard", document: row })}>
                                Discard
                            </Button>
                        </>
                    )}
                    {row.state !== "ACTIVE" && (
                        <Button size="sm" onClick={() => setPending({ action: "activate", document: row })}>
                            {row.state === "SUPERSEDED" ? "Restore" : "Make live"}
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Legal documents"
                subtitle="The text both apps show and nobody signs — policies, contact details and the FAQs, versioned."
                actions={
                    <Button onClick={() => setEditor({ mode: "create", kind, nextVersion, hasLive: live !== null })}>
                        New version
                    </Button>
                }
            />

            {outstanding > 0 && (
                <Card className="rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none" data-testid="legal-placeholder-banner">
                    <p className="text-sm font-medium text-foreground">
                        {outstanding} of {LEGAL_KIND_ORDER.length} documents are still the seeded placeholder.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        The apps show them, marked as placeholders, so no screen is empty. They are a legal deliverable: replace each with the
                        real text and make it live.
                    </p>
                </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-4">
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <ul className="divide-y">
                        {LEGAL_KIND_ORDER.map((value) => {
                            const entry = coverage[value];
                            const active = value === kind;
                            return (
                                <li key={value}>
                                    <button
                                        type="button"
                                        onClick={() => setKind(value)}
                                        className={cn("w-full px-4 py-3 text-left transition-colors", active ? "bg-primary/[0.04]" : "hover:bg-muted/50")}
                                        data-testid={`legal-kind-${value}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-foreground">{LEGAL_KIND_META[value].label}</span>
                                            {entry.live ? (
                                                <span className={cn("text-xs", entry.placeholder ? "text-warning" : "text-muted-foreground")}>
                                                    {entry.placeholder ? "placeholder" : `v${entry.live.version} live`}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-danger">nothing live</span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{LEGAL_KIND_META[value].blurb}</p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                <div className="space-y-4 xl:col-span-3">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">{meta.label}</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {meta.blurb}
                                    {meta.structured ? " · carries a structured payload the apps render as blocks" : ""}
                                </p>
                            </div>
                            {live ? (
                                <div className="text-right">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Live version</p>
                                    <p className="text-metric text-foreground">{versionLabel(live)}</p>
                                </div>
                            ) : null}
                        </div>
                        {live && isPlaceholder(live) && (
                            <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground" data-testid="legal-kind-placeholder">
                                The live version is the seeded placeholder. Both apps mark it as one.
                            </p>
                        )}
                        {!live && (
                            <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-foreground">
                                Nothing is live for this document. The apps answer 404 for it.
                            </p>
                        )}
                    </Card>

                    <SimpleTable columns={columns} rows={versions} rowKey={(row) => row.id} emptyMessage="No versions yet." />
                </div>
            </div>

            <DocumentEditor target={editor} onOpenChange={(open) => !open && setEditor(null)} onSaved={onChanged} />

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={pending?.action === "activate" ? `Make ${pending ? versionLabel(pending.document) : ""} live?` : "Discard this draft?"}
                description={
                    pending?.action === "activate"
                        ? live
                            ? `${versionLabel(live)} is retired. Both apps read the new text on their next open.`
                            : "Both apps can read this document from now on."
                        : "The draft is deleted. Versions that have been live are never deleted."
                }
                confirmLabel={pending?.action === "activate" ? "Make it live" : "Discard"}
                busy={busy}
                destructive={pending?.action === "discard"}
                onConfirm={() => pending && run(pending)}
            />
        </div>
    );
}
