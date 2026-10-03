"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { SectionCard } from "@/components/adx/section-card";
import { useAuth } from "@/lib/auth";
import {
    FORM_AUDIENCES,
    FORM_AUDIENCE_LABEL,
    FORM_DESTINATIONS,
    FORM_DESTINATION_META,
    badEmails,
    formsService,
    parseEmails,
    type FormAudience,
    type FormDestination,
    type FormDetail,
} from "@/services/forms";
import { LEAD_SIDE_LABEL, type LeadSide } from "@/services/leads";

/**
 * FM-1: the form's settings — title, description, where the answers go,
 * who may answer, who is emailed. Saved on their own, apart from the
 * versioned definition; a change here reaches the live form at once.
 */
export function FormSettingsCard({ detail, onChanged, readOnly }: { detail: FormDetail; onChanged: () => void; readOnly?: boolean }) {
    const { can } = useAuth();
    const mayArchive = can("content.delete");
    const [title, setTitle] = React.useState(detail.title);
    const [description, setDescription] = React.useState(detail.description ?? "");
    const [destination, setDestination] = React.useState<FormDestination>(detail.destination);
    const [leadSide, setLeadSide] = React.useState<LeadSide>((detail.leadSide as LeadSide) ?? "ADVERTISER");
    const [audience, setAudience] = React.useState<FormAudience>(detail.audience);
    const [emails, setEmails] = React.useState(detail.notifyEmails.join(", "));
    const [busy, setBusy] = React.useState(false);
    const [archiving, setArchiving] = React.useState(false);

    const emailList = parseEmails(emails);
    const bad = badEmails(emailList);
    const dirty =
        title.trim() !== detail.title ||
        description.trim() !== (detail.description ?? "") ||
        destination !== detail.destination ||
        (destination === "LEAD" && leadSide !== detail.leadSide) ||
        audience !== detail.audience ||
        emailList.join(",") !== detail.notifyEmails.join(",");
    const ready = dirty && title.trim().length > 0 && bad.length === 0;

    async function save() {
        if (!ready || busy) return;
        setBusy(true);
        try {
            await formsService.update(detail.key, {
                title: title.trim(),
                description: description.trim() || null,
                destination,
                leadSide: destination === "LEAD" ? leadSide : null,
                audience,
                notifyEmails: emailList,
            });
            toast.success("Settings saved");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The settings did not save.");
        } finally {
            setBusy(false);
        }
    }

    async function archive() {
        setBusy(true);
        try {
            await formsService.archive(detail.key);
            toast.success("Form archived", { description: "Pages with this form draw nothing; its answers are kept." });
            setArchiving(false);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    async function restore() {
        setBusy(true);
        try {
            await formsService.restoreForm(detail.key);
            toast.success("Form restored", { description: "It answers again with whatever version was live." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Settings"
            description="Apart from the questions: a change here reaches the live form at once."
            actions={
                !readOnly ? (
                    <Button size="sm" onClick={() => void save()} disabled={!ready || busy} data-testid="form-settings-save">
                        {busy ? "Saving…" : "Save settings"}
                    </Button>
                ) : undefined
            }
            footer={
                !readOnly && mayArchive ? (
                    detail.archivedAt ? (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void restore()} data-testid="form-restore">
                            Restore this form
                        </Button>
                    ) : (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-danger hover:text-danger" onClick={() => setArchiving(true)} data-testid="form-archive">
                            Archive this form
                        </Button>
                    )
                ) : undefined
            }
        >
            <fieldset disabled={readOnly || busy} className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="form-title" className="text-xs">
                            Title
                        </Label>
                        <Input id="form-title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-9" data-testid="form-title" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="form-description" className="text-xs">
                            Description — a line under the title
                        </Label>
                        <Input id="form-description" value={description} onChange={(event) => setDescription(event.target.value)} className="h-9" />
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="form-destination" className="text-xs">
                            Answers go to
                        </Label>
                        <Select value={destination} onValueChange={(value) => setDestination(value as FormDestination)}>
                            <SelectTrigger id="form-destination" className="h-9" data-testid="form-destination">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {FORM_DESTINATIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {FORM_DESTINATION_META[option].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="form-side" className="text-xs">
                            A lead for
                        </Label>
                        <Select value={leadSide} onValueChange={(value) => setLeadSide(value as LeadSide)} disabled={destination !== "LEAD"}>
                            <SelectTrigger id="form-side" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(LEAD_SIDE_LABEL) as LeadSide[]).map((side) => (
                                    <SelectItem key={side} value={side}>
                                        {LEAD_SIDE_LABEL[side]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="form-audience" className="text-xs">
                            Who may answer
                        </Label>
                        <Select value={audience} onValueChange={(value) => setAudience(value as FormAudience)}>
                            <SelectTrigger id="form-audience" className="h-9" data-testid="form-audience">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {FORM_AUDIENCES.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {FORM_AUDIENCE_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">{FORM_DESTINATION_META[destination].blurb}</p>
                <div className="space-y-1.5">
                    <Label htmlFor="form-emails" className="text-xs">
                        Email when an answer arrives — comma-separated, empty for nobody
                    </Label>
                    <Textarea id="form-emails" value={emails} onChange={(event) => setEmails(event.target.value)} rows={2} className={cn(bad.length && "border-danger")} data-testid="form-emails" />
                    {bad.length > 0 && <p className="text-xs text-danger">Not an email: {bad.join(", ")}</p>}
                </div>
            </fieldset>

            <ConfirmDialog
                open={archiving}
                onOpenChange={(open) => !open && !busy && setArchiving(false)}
                title={`Archive “${detail.title}”?`}
                description="The published form answers 404 and every page's Form block for it draws nothing. The answers are kept and the key stays taken."
                confirmLabel="Archive"
                destructive
                busy={busy}
                onConfirm={() => void archive()}
            />
        </SectionCard>
    );
}
