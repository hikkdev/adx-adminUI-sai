"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
    KIND_META,
    PARTY_LABEL,
    agreementService,
    versionLabel,
    type AgreementKind,
    type AgreementTemplate,
} from "@/services/agreements";

/** Creating a new version of a kind, or editing a draft that already exists. */
export type EditorTarget =
    | { mode: "create"; kind: AgreementKind; nextVersion: number; hasLive: boolean }
    | { mode: "edit"; template: AgreementTemplate };

interface TemplateEditorProps {
    target: EditorTarget | null;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/**
 * The one form on the templates screen.
 *
 * Saving makes a DRAFT. Going live is a separate, explicit act — the switch at
 * the bottom is there for the case where there is nothing live at all and ops
 * want the stall over in one step, and it is off by default so the ordinary
 * path is write, read it over, then activate from the versions table.
 */
export function TemplateEditor({ target, onOpenChange, onSaved }: TemplateEditorProps) {
    if (!target) return <Dialog open={false} onOpenChange={onOpenChange} />;
    // A fresh form per target: the key remounts it, so its state starts from
    // the target rather than being reset by an effect after the fact.
    const key = target.mode === "edit" ? `edit-${target.template.id}` : `create-${target.kind}-${target.nextVersion}`;
    return <TemplateForm key={key} target={target} onOpenChange={onOpenChange} onSaved={onSaved} />;
}

function TemplateForm({
    target,
    onOpenChange,
    onSaved,
}: {
    target: EditorTarget;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const editing = target.mode === "edit" ? target.template : null;
    const [title, setTitle] = React.useState(editing?.title ?? "");
    const [body, setBody] = React.useState(editing?.body ?? "");
    const [changeNote, setChangeNote] = React.useState(editing?.changeNote ?? "");
    const [activate, setActivate] = React.useState(false);
    /* Lot D (Q55): platform kinds only — a transaction kind is accepted per deal. */
    const [requiresReacceptance, setRequiresReacceptance] = React.useState(editing?.requiresReacceptance ?? false);
    const [busy, setBusy] = React.useState(false);
    const [errors, setErrors] = React.useState<Record<string, string[]>>({});

    const kind = target.mode === "create" ? target.kind : target.template.kind;
    const meta = KIND_META[kind];
    const party = PARTY_LABEL[meta.party];
    const version = target.mode === "create" ? `v${target.nextVersion}` : versionLabel(target.template);

    async function save() {
        if (!title.trim() || !body.trim()) {
            setErrors({
                ...(title.trim() ? {} : { title: ["Give the version a title."] }),
                ...(body.trim() ? {} : { body: ["The agreement needs a body."] }),
            });
            return;
        }
        setBusy(true);
        setErrors({});
        try {
            if (target.mode === "create") {
                const saved = await agreementService.create({
                    kind,
                    title: title.trim(),
                    body,
                    changeNote: changeNote.trim() || undefined,
                    activate,
                    ...(KIND_META[kind].scope === "PLATFORM" ? { requiresReacceptance } : {}),
                });
                toast.success(`${meta.label} ${versionLabel(saved)} ${activate ? "is live" : "saved as a draft"}`, {
                    description: activate
                        ? `Every ${party.singular.toLowerCase()} accepting from now on accepts this text.`
                        : "Read it over, then activate it from the versions list.",
                });
            } else {
                await agreementService.update(target.template.id, {
                    title: title.trim(),
                    body,
                    changeNote: changeNote.trim() || null,
                    ...(KIND_META[target.template.kind].scope === "PLATFORM" ? { requiresReacceptance } : {}),
                });
                toast.success(`${meta.label} ${version} updated`);
            }
            onSaved();
            onOpenChange(false);
        } catch (cause) {
            if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length) {
                setErrors(cause.fieldErrors);
            }
            toast.error(cause instanceof Error ? cause.message : "Could not save the agreement.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !busy && onOpenChange(open)}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {target.mode === "create" ? `New version · ${meta.label}` : `Edit draft · ${meta.label}`}
                    </DialogTitle>
                    <DialogDescription>
                        {target.mode === "create"
                            ? `This becomes ${version}. It is a draft until it is activated.`
                            : `${version} has never been live, so its text can still change.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="agreement-title">Title</Label>
                        <Input
                            id="agreement-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder={`${meta.label} (2026)`}
                            maxLength={200}
                            aria-invalid={Boolean(errors.title)}
                        />
                        {errors.title && <p className="text-xs text-danger">{errors.title[0]}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="agreement-body">Agreement text</Label>
                        <Textarea
                            id="agreement-body"
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            rows={16}
                            className="font-mono text-xs leading-5"
                            placeholder={"# Terms\n\nMarkdown. The apps render it; the console shows the source."}
                            aria-invalid={Boolean(errors.body)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Markdown.{meta.hint ? ` ${meta.hint}` : ""}
                        </p>
                        {errors.body && <p className="text-xs text-danger">{errors.body[0]}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="agreement-note">What changed</Label>
                        <Input
                            id="agreement-note"
                            value={changeNote}
                            onChange={(event) => setChangeNote(event.target.value)}
                            placeholder="Optional. One line for the person reading the versions list."
                            maxLength={500}
                        />
                    </div>

                    {target.mode === "create" && (
                        <label className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Make it live now</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {target.hasLive
                                        ? `Retires the version that is live today. Existing acceptances stay on record; nobody is asked to accept again.`
                                        : `Nothing is live for ${meta.label.toLowerCase()} yet. ${party.plural} are stuck at this gate until a version is.`}
                                </span>
                            </span>
                            <Switch checked={activate} onCheckedChange={setActivate} aria-label="Make it live now" />
                        </label>
                    )}
                    {meta.scope === "PLATFORM" && (
                        <label className="flex items-start justify-between gap-4 rounded-md border px-4 py-3">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Requires re-acceptance</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    Once this version is live, every {party.singular.toLowerCase()} clicks again before transacting.
                                    Off, any earlier acceptance of the {meta.label.toLowerCase()} still clears the gate.
                                </span>
                            </span>
                            <Switch
                                checked={requiresReacceptance}
                                onCheckedChange={setRequiresReacceptance}
                                aria-label="Requires re-acceptance"
                            />
                        </label>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={busy}>
                        {busy
                            ? "Saving…"
                            : target.mode === "edit"
                              ? "Save draft"
                              : activate
                                ? `Save and make ${version} live`
                                : `Save ${version} as a draft`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
