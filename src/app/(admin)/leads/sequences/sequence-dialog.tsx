"use client";

import * as React from "react";
import { Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    channelLabel,
    delayLabel,
    LEAD_SIDE_LABEL,
    outreachService,
    SEQUENCE_CHANNELS,
    TEMPERATURE_META,
    type LeadSequence,
    type LeadSide,
    type LeadTemperature,
    type OutreachChannel,
    type SequenceStep,
    type StepPreview,
} from "@/services/leads";

/** A blank step: WhatsApp a day on with no template yet — the editor insists on one before saving. */
const blankStep = (): SequenceStep => ({ channel: "WHATSAPP", delayHours: 24, templateKey: null });

/** Why the steps cannot be saved yet, or null. */
export function stepsProblem(steps: readonly SequenceStep[]): string | null {
    if (steps.length === 0) return "Add at least one step.";
    const bad = steps.findIndex((step) => step.channel !== "CALL" && !step.templateKey?.trim());
    if (bad >= 0) return `Step ${bad + 1} (${channelLabel(steps[bad]!.channel)}) needs a template key.`;
    return null;
}

/**
 * LH6: the sequence editor — a side, a temperature, a name, the steps (a
 * channel, a delay from the step before, the comms template whose copy
 * goes — or a call, which lands a task), stop-on-reply, on/off. The
 * preview renders a step's template with sample values.
 */
export function SequenceDialog({
    open,
    onOpenChange,
    sequence,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sequence: LeadSequence | null;
    onSaved: (sequence: LeadSequence) => void;
}) {
    const [side, setSide] = React.useState<LeadSide>("PUBLISHER");
    const [temperature, setTemperature] = React.useState<LeadTemperature>("WARM");
    const [name, setName] = React.useState("");
    const [steps, setSteps] = React.useState<SequenceStep[]>([blankStep()]);
    const [stopOnReply, setStopOnReply] = React.useState(true);
    const [isActive, setIsActive] = React.useState(true);
    const [preview, setPreview] = React.useState<{ index: number; result: StepPreview | null; error: string | null } | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [seededFor, setSeededFor] = React.useState<string | null>(null);

    const seedKey = open ? (sequence?.id ?? "new") : null;
    if (seedKey !== seededFor) {
        setSeededFor(seedKey);
        if (seedKey !== null) {
            setSide(sequence?.side ?? "PUBLISHER");
            setTemperature(sequence?.temperature ?? "WARM");
            setName(sequence?.name ?? "");
            setSteps(sequence?.steps.map((step) => ({ ...step })) ?? [blankStep()]);
            setStopOnReply(sequence?.stopOnReply ?? true);
            setIsActive(sequence?.isActive ?? true);
            setPreview(null);
        }
    }

    const problem = name.trim().length < 2 ? "Give it a name." : stepsProblem(steps);
    const update = (index: number, patch: Partial<SequenceStep>) => setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));

    async function showPreview(index: number) {
        const key = steps[index]?.templateKey?.trim();
        if (!key) return;
        try {
            setPreview({ index, result: await outreachService.preview(key), error: null });
        } catch (cause) {
            setPreview({ index, result: null, error: cause instanceof Error ? cause.message : "No such template." });
        }
    }

    async function submit() {
        if (problem || busy) return;
        setBusy(true);
        try {
            const input = { side, temperature, name: name.trim(), steps: steps.map((step) => ({ channel: step.channel, delayHours: Number(step.delayHours) || 0, templateKey: step.channel === "CALL" ? null : step.templateKey?.trim() || null })), stopOnReply, isActive };
            const saved = sequence ? await outreachService.updateSequence(sequence.id, input) : await outreachService.createSequence(input);
            toast.success(sequence ? "Sequence saved" : "Sequence created");
            onSaved(saved);
            onOpenChange(false);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the sequence.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl" data-testid="sequence-dialog">
                <DialogHeader>
                    <DialogTitle>{sequence ? "Edit the sequence" : "New sequence"}</DialogTitle>
                    <DialogDescription>The scripted follow-up a lead of this side and temperature walks until it replies on any channel. Each delay counts from the step before.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="seq-side">Side</Label>
                        <Select value={side} onValueChange={(value) => setSide(value as LeadSide)}>
                            <SelectTrigger id="seq-side" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(LEAD_SIDE_LABEL) as LeadSide[]).map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {LEAD_SIDE_LABEL[value]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="seq-temperature">Temperature</Label>
                        <Select value={temperature} onValueChange={(value) => setTemperature(value as LeadTemperature)}>
                            <SelectTrigger id="seq-temperature" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(TEMPERATURE_META) as LeadTemperature[]).map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {TEMPERATURE_META[value].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="seq-name">Name</Label>
                        <Input id="seq-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Publisher · warm" data-testid="seq-name" />
                    </div>
                </div>

                <div className="space-y-2" data-testid="seq-steps">
                    <div className="flex items-center justify-between">
                        <Label>Steps</Label>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setSteps((current) => [...current, blankStep()])} data-testid="seq-add-step">
                            <Plus className="mr-1 size-3" /> Step
                        </Button>
                    </div>
                    {steps.map((step, index) => (
                        <div key={index} className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[2rem_minmax(0,10rem)_minmax(0,7rem)_1fr_auto]" data-testid={`seq-step-${index}`}>
                            <span className="pb-2 text-xs text-muted-foreground">{index + 1}.</span>
                            <div className="space-y-1">
                                <Label htmlFor={`seq-step-${index}-channel`} className="text-[11px]">
                                    Channel
                                </Label>
                                <Select value={step.channel} onValueChange={(value) => update(index, { channel: value as OutreachChannel, ...(value === "CALL" ? { templateKey: null } : {}) })}>
                                    <SelectTrigger id={`seq-step-${index}-channel`} className="h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SEQUENCE_CHANNELS.map((value) => (
                                            <SelectItem key={value} value={value}>
                                                {channelLabel(value)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`seq-step-${index}-delay`} className="text-[11px]">
                                    Delay (hours) · {delayLabel(Number(step.delayHours) || 0)}
                                </Label>
                                <Input id={`seq-step-${index}-delay`} type="number" min={0} className="h-8" value={step.delayHours} onChange={(event) => update(index, { delayHours: Number(event.target.value) })} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`seq-step-${index}-template`} className="text-[11px]">
                                    {step.channel === "CALL" ? "A call — lands a task on the holder" : "Template key"}
                                </Label>
                                <Input id={`seq-step-${index}-template`} className="h-8" disabled={step.channel === "CALL"} value={step.templateKey ?? ""} onChange={(event) => update(index, { templateKey: event.target.value })} placeholder={step.channel === "CALL" ? "—" : "lead-seq-publisher-intro"} data-testid={`seq-step-${index}-template`} />
                            </div>
                            <div className="flex items-center gap-1 pb-0.5">
                                <Button size="sm" variant="ghost" className="h-8 px-2" disabled={step.channel === "CALL" || !step.templateKey?.trim()} onClick={() => void showPreview(index)} title="Preview" data-testid={`seq-step-${index}-preview`}>
                                    <Eye className="size-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 px-2 text-danger" disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((_, i) => i !== index))} title="Remove">
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    {preview ? (
                        <div className="rounded-md border bg-muted/30 p-3 text-sm" data-testid="seq-preview">
                            <p className="text-xs font-medium text-muted-foreground">Preview · step {preview.index + 1}</p>
                            {preview.error ? (
                                <p className="mt-1 text-danger">{preview.error}</p>
                            ) : preview.result ? (
                                <>
                                    {preview.result.subject ? <p className="mt-1 font-medium text-foreground">{preview.result.subject}</p> : null}
                                    <p className="mt-1 whitespace-pre-line text-foreground">{preview.result.short}</p>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-sm">
                        <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} /> Stop on any reply
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="seq-active" /> On
                    </label>
                </div>
                {problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={Boolean(problem) || busy} data-testid="seq-save">
                        {busy ? "Saving…" : sequence ? "Save" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
