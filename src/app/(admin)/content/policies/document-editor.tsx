"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownField } from "@/components/adx/markdown-field";
import { LEGAL_KIND_META, legalService, versionLabel, type LegalDocument, type LegalKind } from "@/services/legal";

/**
 * `revise` is the everyday path: the live policy, opened for editing, saved
 * straight back live with the old text kept as the previous revision.
 * `create` starts one where nothing is live, `edit` changes a draft in place,
 * and `read` shows an earlier revision from the history.
 */
export type EditorTarget =
    | { mode: "revise"; document: LegalDocument; nextVersion: number }
    | { mode: "create"; kind: LegalKind; nextVersion: number; hasLive: boolean; /** Start from this version's text. */ seed?: LegalDocument }
    | { mode: "edit"; document: LegalDocument }
    | { mode: "read"; document: LegalDocument };

interface DocumentEditorProps {
    target: EditorTarget | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
    /** Offered on a published version, which cannot change: carry its text into the next one. */
    onWriteNewVersion?: (from: LegalDocument) => void;
}

/**
 * The one form on the legal screen.
 *
 * Saving makes a DRAFT; going live is a separate act, for the same reason it
 * is on agreements — the text people read should be read over first. Contact
 * info and the FAQs carry a structured payload beside the markdown, so those
 * two kinds get a JSON field; it is validated here rather than at the server's
 * expense, and a malformed one refuses to save.
 */
export function DocumentEditor({ target, onOpenChange, onSaved, onWriteNewVersion }: DocumentEditorProps) {
    if (!target) return <Dialog open={false} onOpenChange={onOpenChange} />;
    const key =
        target.mode === "create" ? `create-${target.kind}-${target.nextVersion}` : `${target.mode}-${target.document.id}`;
    return <DocumentForm key={key} target={target} onOpenChange={onOpenChange} onSaved={onSaved} onWriteNewVersion={onWriteNewVersion} />;
}

function DocumentForm({ target, onOpenChange, onSaved, onWriteNewVersion }: { target: EditorTarget; onOpenChange: (open: boolean) => void; onSaved: () => void; onWriteNewVersion?: (from: LegalDocument) => void }) {
    const existing = target.mode === "create" ? (target.seed ?? null) : target.document;
    const readOnly = target.mode === "read";
    const revising = target.mode === "revise";
    const kind = target.mode === "create" ? target.kind : target.document.kind;
    const meta = LEGAL_KIND_META[kind];

    /* Seeding from a placeholder drops its marks: the title's "(placeholder)"
       suffix, and its change note — a note describes the change being made
       now, not the one before it. */
    const seeded = revising || (target.mode === "create" && Boolean(target.seed));
    const [title, setTitle] = React.useState((seeded ? (existing?.title ?? "").replace(/\s*\(placeholder\)\s*$/i, "") : existing?.title) ?? "");
    const [summary, setSummary] = React.useState(existing?.summary ?? "");
    const [body, setBody] = React.useState(existing?.body ?? "");
    const [payload, setPayload] = React.useState(existing?.meta ? JSON.stringify(existing.meta, null, 2) : "");
    const [changeNote, setChangeNote] = React.useState(target.mode === "edit" ? (existing?.changeNote ?? "") : "");
    const [activate, setActivate] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [errors, setErrors] = React.useState<Record<string, string[]>>({});

    const version = target.mode === "create" ? `v${target.nextVersion}` : versionLabel(target.document);

    async function save() {
        const problems: Record<string, string[]> = {};
        if (!title.trim()) problems.title = ["Give the version a title."];
        if (!body.trim()) problems.body = ["The document needs a body."];
        let parsed: Record<string, unknown> | undefined;
        if (meta.structured && payload.trim()) {
            try {
                const value = JSON.parse(payload);
                if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
                parsed = value as Record<string, unknown>;
            } catch {
                problems.meta = ["This has to be a JSON object — the apps read it directly."];
            }
        }
        if (Object.keys(problems).length) {
            setErrors(problems);
            return;
        }

        setBusy(true);
        setErrors({});
        try {
            if (revising) {
                // One act for the writer; two rows in the table, so the history keeps itself.
                await legalService.create({
                    kind,
                    title: title.trim(),
                    ...(summary.trim() ? { summary: summary.trim() } : {}),
                    body,
                    ...(parsed ? { meta: parsed } : {}),
                    ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
                    activate: true,
                });
                toast.success(`${meta.label} updated`, { description: "It is live. The text it replaced is in the revision history." });
                onSaved();
                onOpenChange(false);
                return;
            }
            if (target.mode === "create") {
                const saved = await legalService.create({
                    kind,
                    title: title.trim(),
                    ...(summary.trim() ? { summary: summary.trim() } : {}),
                    body,
                    ...(parsed ? { meta: parsed } : {}),
                    ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
                    activate,
                });
                toast.success(`${meta.label} ${versionLabel(saved)} ${activate ? "is live" : "saved as a draft"}`, {
                    description: activate ? "Both apps read it on their next open." : "Read it over, then make it live from the versions list.",
                });
            } else {
                await legalService.update(target.document.id, {
                    title: title.trim(),
                    summary: summary.trim() || null,
                    body,
                    ...(meta.structured ? { meta: parsed ?? null } : {}),
                    changeNote: changeNote.trim() || null,
                });
                toast.success(`${meta.label} ${version} updated`);
            }
            onSaved();
            onOpenChange(false);
        } catch (cause) {
            if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length) setErrors(cause.fieldErrors);
            toast.error(cause instanceof Error ? cause.message : "Could not save the document.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
            <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {revising ? `Edit · ${meta.label}` : target.mode === "create" ? `New version · ${meta.label}` : target.mode === "edit" ? `Edit draft · ${meta.label}` : `${meta.label} ${version}`}
                    </DialogTitle>
                    <DialogDescription>
                        {revising
                            ? "Change the text and save: it goes live, and what it replaces is kept in the revision history below."
                            : target.mode === "create"
                            ? `This becomes ${version}. It is a draft until it is made live.`
                            : target.mode === "edit"
                              ? `${version} has never been live, so its text can still change.`
                              : `${version} has been live. Its text is what people read, so it cannot change. Write a new version to replace it — the button below starts one with this text.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 pr-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="legal-title">Title</Label>
                        <Input id="legal-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={readOnly} maxLength={200} aria-invalid={Boolean(errors.title)} />
                        {errors.title && <p className="text-xs text-danger">{errors.title[0]}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="legal-summary">Summary</Label>
                        <Input
                            id="legal-summary"
                            value={summary}
                            onChange={(event) => setSummary(event.target.value)}
                            disabled={readOnly}
                            maxLength={300}
                            placeholder={meta.blurb}
                        />
                        <p className="text-xs text-muted-foreground">One line, shown under the title on the apps&apos; About &amp; Policies list.</p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="legal-body">Document text</Label>
                        <MarkdownField
                            id="legal-body"
                            value={body}
                            onChange={setBody}
                            disabled={readOnly}
                            rows={16}
                            placeholder="Markdown. Preview shows what the apps will draw."
                            aria-invalid={Boolean(errors.body)}
                        />
                        {errors.body && <p className="text-xs text-danger">{errors.body[0]}</p>}
                    </div>

                    {meta.structured && (
                        <div className="space-y-1.5">
                            <Label htmlFor="legal-meta">Structured payload</Label>
                            <Textarea
                                id="legal-meta"
                                value={payload}
                                onChange={(event) => setPayload(event.target.value)}
                                disabled={readOnly}
                                rows={10}
                                className="font-mono text-xs leading-5"
                                placeholder={kind === "FAQ" ? '{ "items": [{ "q": "…", "a": "…", "tags": ["ORDERS"] }] }' : '{ "office": { "name": "…", "address": "…" } }'}
                                aria-invalid={Boolean(errors.meta)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {kind === "FAQ"
                                    ? "The apps render `items` as the FAQs accordion; the tags become its chips."
                                    : "The apps render this as the contact blocks — office, lines, email, registration."}
                            </p>
                            {errors.meta && <p className="text-xs text-danger">{errors.meta[0]}</p>}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="legal-note">What changed</Label>
                        <Input
                            id="legal-note"
                            value={changeNote}
                            onChange={(event) => setChangeNote(event.target.value)}
                            disabled={readOnly}
                            placeholder="Optional. One line for the person reading the versions list."
                            maxLength={500}
                        />
                    </div>

                    {target.mode === "create" && !revising && (
                        <label className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Make it live now</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {target.hasLive
                                        ? "Retires the version that is live today. Both apps read the new text on their next open."
                                        : `Nothing is live for ${meta.label.toLowerCase()} yet, so the apps answer 404 for it until one is.`}
                                </span>
                            </span>
                            <Switch checked={activate} onCheckedChange={setActivate} aria-label="Make it live now" />
                        </label>
                    )}
                </div>

                <DialogFooter>
                    {readOnly && onWriteNewVersion && (
                        <Button
                            onClick={() => {
                                onOpenChange(false);
                                onWriteNewVersion(target.document);
                            }}
                            data-testid="legal-write-new-version"
                        >
                            Write a new version
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        {readOnly ? "Close" : "Cancel"}
                    </Button>
                    {!readOnly && (
                        <Button onClick={save} disabled={busy}>
                            {busy ? "Saving…" : revising ? "Save — this goes live" : target.mode === "edit" ? "Save draft" : activate ? `Save and make ${version} live` : `Save ${version} as a draft`}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
