"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    CUSTOM_FIELD_ENTITY_LABEL,
    CUSTOM_FIELD_KINDS,
    CUSTOM_FIELD_KIND_LABEL,
    customFieldsService,
    defProblems,
    fieldKeyFrom,
    optionsText,
    parseOptions,
    takesOptions,
    type CustomFieldDef,
    type CustomFieldEntity,
    type CustomFieldKind,
    type CustomFieldOption,
} from "@/services/custom-fields";

interface CustomFieldDialogProps {
    entity: CustomFieldEntity;
    /** The definition being edited; null makes a new one. */
    def: CustomFieldDef | null;
    takenKeys: readonly string[];
    /** Where a new field lands in the order: after the last. */
    nextOrder: number;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

/**
 * CF-1: one definition — the label (the key follows it until typed, and
 * never changes once made), the kind and its options, the guidance, whether
 * it is required, where it shows, whether the owner may answer, and its
 * place in the order.
 */
export function CustomFieldDialog({ entity, def, takenKeys, nextOrder, onOpenChange, onSaved }: CustomFieldDialogProps) {
    const editing = def !== null;
    const [label, setLabel] = React.useState(def?.label ?? "");
    const [key, setKey] = React.useState(def?.key ?? "");
    const [keyTouched, setKeyTouched] = React.useState(editing);
    const [kind, setKind] = React.useState<CustomFieldKind>((def?.kind as CustomFieldKind) ?? "text");
    const [options, setOptions] = React.useState<CustomFieldOption[]>(def?.options ?? []);
    const [optionLines, setOptionLines] = React.useState(() => optionsText(def?.options));
    const [hint, setHint] = React.useState(def?.hint ?? "");
    const [required, setRequired] = React.useState(def?.required ?? false);
    const [showOnDesk, setShowOnDesk] = React.useState(def?.showOnDesk ?? true);
    const [showInApps, setShowInApps] = React.useState(def?.showInApps ?? false);
    const [showOnWebsite, setShowOnWebsite] = React.useState(def?.showOnWebsite ?? false);
    const [editableByOwner, setEditableByOwner] = React.useState(def?.editableByOwner ?? false);
    const [sortOrder, setSortOrder] = React.useState(String(def?.sortOrder ?? nextOrder));
    const [busy, setBusy] = React.useState(false);
    const [tried, setTried] = React.useState(false);

    const problems = defProblems({ key, label, kind, options }, takenKeys);
    const ready = Object.keys(problems).length === 0 && Number.isInteger(Number(sortOrder));
    const shown = (name: string) => (tried ? problems[name] : undefined);

    async function submit() {
        setTried(true);
        if (!ready || busy) return;
        setBusy(true);
        try {
            const common = {
                label: label.trim(),
                kind,
                options: takesOptions(kind) ? options : undefined,
                hint: hint.trim() || undefined,
                required,
                showOnDesk,
                showInApps,
                showOnWebsite,
                editableByOwner,
                sortOrder: Number(sortOrder),
            };
            if (def) await customFieldsService.update(def.id, { ...common, options: takesOptions(kind) ? options : null, hint: hint.trim() || null });
            else await customFieldsService.create({ entity, key, ...common });
            toast.success(def ? "Field saved" : `“${label.trim()}” added`, { description: def ? undefined : `Asked of every ${CUSTOM_FIELD_ENTITY_LABEL[entity].toLowerCase().replace(/s$/, "")} from now on.` });
            onSaved();
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The field did not save.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(next) => (!next && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{def ? `Edit “${def.label}”` : `New field for ${CUSTOM_FIELD_ENTITY_LABEL[entity].toLowerCase()}`}</DialogTitle>
                    <DialogDescription>{def ? "The key and the kind's answers already given stay as they are." : "A question the record's own columns do not ask. Aadhaar is never one."}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="cf-label">Label</Label>
                            <Input
                                id="cf-label"
                                value={label}
                                onChange={(event) => {
                                    setLabel(event.target.value);
                                    if (!keyTouched) setKey(fieldKeyFrom(event.target.value));
                                }}
                                placeholder="Preferred contact time"
                                autoFocus
                                data-testid="cf-label"
                            />
                            <p className={cn("text-xs", shown("label") ? "text-danger" : "text-muted-foreground")}>{shown("label") ?? "What the person sees."}</p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="cf-key">Key — never changes</Label>
                            <Input
                                id="cf-key"
                                value={key}
                                onChange={(event) => {
                                    setKeyTouched(true);
                                    setKey(event.target.value);
                                }}
                                disabled={editing}
                                placeholder="preferred_contact_time"
                                className="font-mono"
                                data-testid="cf-key"
                            />
                            <p className={cn("text-xs", shown("key") ? "text-danger" : "text-muted-foreground")}>{shown("key") ?? "What the answers are filed under."}</p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid content-start gap-1.5">
                            <Label htmlFor="cf-kind">Kind</Label>
                            <Select value={kind} onValueChange={(value) => setKind(value as CustomFieldKind)}>
                                <SelectTrigger id="cf-kind" data-testid="cf-kind">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CUSTOM_FIELD_KINDS.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {CUSTOM_FIELD_KIND_LABEL[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className={cn("text-xs", shown("kind") ? "text-danger" : "text-muted-foreground")}>{shown("kind") ?? "How it is answered."}</p>
                        </div>
                        <div className="grid content-start gap-1.5">
                            <Label htmlFor="cf-order">Order</Label>
                            <Input id="cf-order" inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} data-testid="cf-order" />
                            <p className="text-xs text-muted-foreground">Lower comes first on the card.</p>
                        </div>
                    </div>

                    {takesOptions(kind) && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="cf-options">Options — one per line, “value | Label” or just the label</Label>
                            <Textarea
                                id="cf-options"
                                value={optionLines}
                                onChange={(event) => {
                                    setOptionLines(event.target.value);
                                    setOptions(parseOptions(event.target.value));
                                }}
                                rows={4}
                                className={cn("font-mono text-xs", shown("options") && "border-danger")}
                                data-testid="cf-options"
                            />
                            {shown("options") && <p className="text-xs text-danger">{shown("options")}</p>}
                        </div>
                    )}

                    <div className="grid gap-1.5">
                        <Label htmlFor="cf-hint">Guidance — one line under the label</Label>
                        <Input id="cf-hint" value={hint} onChange={(event) => setHint(event.target.value)} placeholder="When they are usually free to talk" />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={required} onCheckedChange={(checked) => setRequired(checked === true)} data-testid="cf-required" />
                            Required
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={editableByOwner} onCheckedChange={(checked) => setEditableByOwner(checked === true)} data-testid="cf-owner" />
                            The record's owner may answer it
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={showOnDesk} onCheckedChange={(checked) => setShowOnDesk(checked === true)} data-testid="cf-desk" />
                            Show on the desk
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={showInApps} onCheckedChange={(checked) => setShowInApps(checked === true)} data-testid="cf-apps" />
                            Show in the apps
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={showOnWebsite} onCheckedChange={(checked) => setShowOnWebsite(checked === true)} data-testid="cf-website" />
                            Show on the website
                        </label>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={busy} data-testid="cf-submit">
                        {busy ? "Saving…" : def ? "Save" : "Add field"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
