"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, History, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { cn } from "@/lib/utils";
import {
    DEFINITION_LIMITS,
    allFields,
    cleanDefinition,
    definitionProblems,
    emptyDefinition,
    formsService,
    moveItem,
    newFieldId,
    newScreenKey,
    sameDefinition,
    type FieldKindInfo,
    type FormDefinition,
    type FormDetail,
    type FormField,
    type FormScreen,
} from "@/services/forms";
import { FieldEditor } from "./field-editor";
import { FormHistorySheet } from "./form-history-sheet";
import { FormPreview } from "./form-preview";
import { FormSettingsCard } from "./form-settings-card";
import { SubmissionsTab } from "./submissions-tab";

const NONE = "__none__";

/** The problems filed under one prefix, with the prefix stripped — a screen's own, a field's own. */
export function problemsUnder(problems: Record<string, string>, prefix: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, message] of Object.entries(problems)) {
        if (path === prefix) out[""] = message;
        else if (path.startsWith(`${prefix}.`)) out[path.slice(prefix.length + 1)] = message;
    }
    return out;
}

/**
 * FM-1 — one form's editor.
 *
 * The settings card and the screens of the draft down the left, the phone
 * preview on the right; Save keeps the draft, Publish (content approvers)
 * makes it live and retires the live one, History restores any earlier
 * version as a new one — the layouts' rules, on a form. Leaving with
 * unsaved edits asks first. The Submissions tab is the answers.
 */
export function FormEditorView({ detail, kinds, onReload }: { detail: FormDetail; kinds: FieldKindInfo[]; onReload: () => void }) {
    const { can } = useAuth();
    const mayEdit = can("content.edit");
    const mayPublish = can("content.approve");
    const mayDiscard = can("content.delete");

    const base = React.useMemo<FormDefinition>(() => detail.draft?.definition ?? detail.live?.definition ?? emptyDefinition(), [detail]);
    const [definition, setDefinition] = React.useState<FormDefinition>(base);
    const [openFieldId, setOpenFieldId] = React.useState<string | null>(null);
    const [showErrors, setShowErrors] = React.useState(false);
    const [serverIssues, setServerIssues] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState<null | "save" | "publish" | "discard">(null);
    const [publishOpen, setPublishOpen] = React.useState(false);
    const [discardOpen, setDiscardOpen] = React.useState(false);
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [note, setNote] = React.useState(detail.draft?.changeNote ?? "");

    const dirty = !sameDefinition(definition, base);
    useUnsavedGuard(dirty);

    const problems = React.useMemo(() => definitionProblems(definition, detail.audience, kinds), [definition, detail.audience, kinds]);
    const problemCount = Object.keys(problems).length;
    const fields = allFields(definition);
    const fieldIds = fields.map((item) => item.field.id);

    const change = (next: FormDefinition) => {
        setDefinition(next);
        setServerIssues([]);
    };
    const updateScreen = (index: number, next: FormScreen) => change({ ...definition, screens: definition.screens.map((screen, at) => (at === index ? next : screen)) });

    function addScreen() {
        if (definition.screens.length >= DEFINITION_LIMITS.screens.max) return;
        change({ ...definition, screens: [...definition.screens, { key: newScreenKey(definition.screens.map((screen) => screen.key)), title: "", fields: [] }] });
    }

    function addField(screenIndex: number, kind: string) {
        const screen = definition.screens[screenIndex]!;
        const id = newFieldId(kind, fieldIds);
        const field: FormField = { id, kind, label: "", required: false };
        updateScreen(screenIndex, { ...screen, fields: [...screen.fields, field] });
        setOpenFieldId(id);
    }

    async function saveDraft(changeNote?: string): Promise<boolean> {
        if (problemCount > 0) {
            setShowErrors(true);
            const first = fields.find((item) => Object.keys(problems).some((path) => path.startsWith(`screens.${item.screenIndex}.fields.${item.index}`)));
            if (first) setOpenFieldId(first.field.id);
            toast.error(`${problemCount} ${problemCount === 1 ? "thing needs" : "things need"} attention before saving.`);
            return false;
        }
        try {
            await formsService.saveDraft(detail.key, cleanDefinition(definition), changeNote?.trim() || undefined);
            return true;
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 400) {
                const issues = (cause.details as { issues?: { path?: string; message?: string }[] } | undefined)?.issues;
                const lines = Array.isArray(issues) ? issues.map((issue) => [issue.path, issue.message].filter(Boolean).join(": ")) : Object.entries(cause.fieldErrors).map(([path, messages]) => `${path}: ${messages.join(" ")}`);
                setServerIssues(lines.length ? lines : [cause.message]);
                setShowErrors(true);
            }
            toast.error(cause instanceof Error ? cause.message : "The draft did not save.");
            return false;
        }
    }

    async function onSave() {
        setBusy("save");
        const ok = await saveDraft();
        setBusy(null);
        if (ok) {
            toast.success("Draft saved", { description: "Nothing changes for anyone answering until it is published." });
            onReload();
        }
    }

    async function onPublish() {
        setBusy("publish");
        try {
            if (dirty) {
                const ok = await saveDraft(note);
                if (!ok) return;
            }
            const published = await formsService.publish(detail.key, note.trim() || undefined);
            toast.success(`Version ${published.number} is live`, { description: "Every page with this form asks the new questions now." });
            setPublishOpen(false);
            onReload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The form did not publish.");
        } finally {
            setBusy(null);
        }
    }

    async function onDiscard() {
        setBusy("discard");
        try {
            if (detail.draft) {
                await formsService.discardDraft(detail.key);
                toast.success("Draft discarded");
                setDiscardOpen(false);
                onReload();
            } else {
                change(base);
                setOpenFieldId(null);
                setDiscardOpen(false);
            }
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(null);
        }
    }

    const contactCandidates = (want: string[]) => fields.filter((item) => want.includes(item.field.kind));
    const setContact = (slot: "name" | "email" | "phone", fieldId: string) => {
        const map = { ...(definition.contactMap ?? {}) };
        if (fieldId === NONE) delete map[slot];
        else map[slot] = fieldId;
        change({ ...definition, contactMap: Object.keys(map).length ? map : undefined });
    };

    return (
        <div className="space-y-5" data-testid="form-editor">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <Link href="/content/forms" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="size-3" /> Forms
                    </Link>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{detail.title}</h1>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono text-xs">{detail.key}</span>
                        {detail.archivedAt ? (
                            <StatusBadge status={{ label: "Archived", tone: "neutral" }} />
                        ) : detail.live ? (
                            <>
                                <StatusBadge status={{ label: `Live v${detail.live.number}`, tone: "success" }} />
                                <span>{detail.live.publishedAt ? `published ${formatDateTime(detail.live.publishedAt)}` : ""}</span>
                            </>
                        ) : (
                            <StatusBadge status={{ label: "Not published", tone: "warning" }} />
                        )}
                        {detail.draft && (
                            <>
                                <StatusBadge status={{ label: `Draft v${detail.draft.number}`, tone: "warning" }} />
                                <span>saved {formatDateTime(detail.draft.updatedAt ?? detail.draft.createdAt)}</span>
                            </>
                        )}
                        {dirty && <StatusBadge status={{ label: "Unsaved changes", tone: "info" }} />}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button variant="outline" className="bg-card" onClick={() => setHistoryOpen(true)} data-testid="form-history-open">
                        <History className="mr-1.5 size-4" />
                        History
                    </Button>
                    {((detail.draft && mayDiscard) || (!detail.draft && dirty && mayEdit)) && (
                        <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setDiscardOpen(true)} disabled={busy !== null} data-testid="form-discard">
                            {detail.draft ? "Discard draft" : "Undo changes"}
                        </Button>
                    )}
                    {mayEdit && (
                        <Button variant="outline" className="bg-card" onClick={() => void onSave()} disabled={!dirty || busy !== null} data-testid="form-save">
                            {busy === "save" ? "Saving…" : "Save draft"}
                        </Button>
                    )}
                    <Button
                        onClick={() => setPublishOpen(true)}
                        disabled={!mayPublish || busy !== null || (!detail.draft && !dirty)}
                        title={!mayPublish ? "Publishing needs content.approve" : !detail.draft && !dirty ? "Nothing to publish — change something first" : undefined}
                        data-testid="form-publish"
                    >
                        Publish
                    </Button>
                </div>
            </div>

            {!mayEdit && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">You can read this form; editing needs content.edit.</p>}

            <Tabs defaultValue="build">
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {[
                        { value: "build", label: "Build" },
                        { value: "submissions", label: `Submissions${detail.submissionsNew ? ` (${detail.submissionsNew} new)` : ""}` },
                    ].map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="-mb-px rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            data-testid={`form-tab-${tab.value}`}
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="build" className="mt-4">
                    <div className="grid gap-5 xl:grid-cols-5">
                        <div className="space-y-4 xl:col-span-3">
                            <FormSettingsCard detail={detail} onChanged={onReload} readOnly={!mayEdit} />

                            {serverIssues.length > 0 && (
                                <ul className="space-y-0.5 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                                    {serverIssues.map((issue, at) => (
                                        <li key={at}>{issue}</li>
                                    ))}
                                </ul>
                            )}
                            {showErrors && problems.screens && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{problems.screens}</p>}
                            {showErrors && problems.fields && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{problems.fields}</p>}

                            <fieldset disabled={!mayEdit} className="space-y-4">
                                {definition.screens.map((screen, screenIndex) => {
                                    const screenProblems = problemsUnder(problems, `screens.${screenIndex}`);
                                    return (
                                        <Card key={screen.key || screenIndex} className="rounded-lg border-border shadow-none" data-testid={`form-screen-${screenIndex}`}>
                                            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                        Screen {screenIndex + 1} of {definition.screens.length}
                                                        {definition.screens.length === 1 ? " — one screen, no stepper" : ""}
                                                    </p>
                                                    <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_180px]">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor={`screen-${screenIndex}-title`} className="text-xs">
                                                                Heading — shown above the fields
                                                            </Label>
                                                            <Input id={`screen-${screenIndex}-title`} value={screen.title ?? ""} onChange={(event) => updateScreen(screenIndex, { ...screen, title: event.target.value })} className="h-9" placeholder="About you" />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor={`screen-${screenIndex}-key`} className="text-xs">
                                                                Key
                                                            </Label>
                                                            <Input id={`screen-${screenIndex}-key`} value={screen.key} onChange={(event) => updateScreen(screenIndex, { ...screen, key: event.target.value })} className={cn("h-9 font-mono", showErrors && screenProblems.key && "border-danger")} />
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 space-y-1.5">
                                                        <Label htmlFor={`screen-${screenIndex}-description`} className="text-xs">
                                                            A line under the heading
                                                        </Label>
                                                        <Input id={`screen-${screenIndex}-description`} value={screen.description ?? ""} onChange={(event) => updateScreen(screenIndex, { ...screen, description: event.target.value })} className="h-9" />
                                                    </div>
                                                    {showErrors && screenProblems.key && <p className="mt-1 text-xs text-danger">{screenProblems.key}</p>}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-0.5">
                                                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={screenIndex === 0} onClick={() => change({ ...definition, screens: moveItem(definition.screens, screenIndex, screenIndex - 1) })} aria-label="Move screen up">
                                                        <ArrowUp className="size-3.5" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" disabled={screenIndex === definition.screens.length - 1} onClick={() => change({ ...definition, screens: moveItem(definition.screens, screenIndex, screenIndex + 1) })} aria-label="Move screen down">
                                                        <ArrowDown className="size-3.5" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-danger hover:text-danger" disabled={definition.screens.length <= 1} onClick={() => change({ ...definition, screens: definition.screens.filter((_, at) => at !== screenIndex) })} aria-label="Remove screen">
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="space-y-2 p-3">
                                                {screen.fields.length === 0 ? (
                                                    <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No fields on this screen yet.</p>
                                                ) : (
                                                    <ol className="space-y-2" aria-label={`Fields of screen ${screenIndex + 1}`}>
                                                        {screen.fields.map((field, index) => (
                                                            <FieldEditor
                                                                key={`${screenIndex}-${index}`}
                                                                field={field}
                                                                index={index}
                                                                count={screen.fields.length}
                                                                definition={definition}
                                                                kinds={kinds}
                                                                problems={problemsUnder(problems, `screens.${screenIndex}.fields.${index}`)}
                                                                showErrors={showErrors}
                                                                open={openFieldId === field.id}
                                                                onToggle={() => setOpenFieldId(openFieldId === field.id ? null : field.id)}
                                                                onChange={(next) => updateScreen(screenIndex, { ...screen, fields: screen.fields.map((item, at) => (at === index ? next : item)) })}
                                                                onMove={(delta) => updateScreen(screenIndex, { ...screen, fields: moveItem(screen.fields, index, index + delta) })}
                                                                onRemove={() => updateScreen(screenIndex, { ...screen, fields: screen.fields.filter((_, at) => at !== index) })}
                                                            />
                                                        ))}
                                                    </ol>
                                                )}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="sm" variant="outline" className="bg-card" disabled={fields.length >= DEFINITION_LIMITS.fields} data-testid={`form-add-field-${screenIndex}`}>
                                                            <Plus className="mr-1 size-4" />
                                                            Add field
                                                            <ChevronDown className="ml-1 size-3.5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start" className="max-h-96 w-60 overflow-y-auto">
                                                        {kinds.map((kind) => {
                                                            const blocked = kind.signedInOnly && detail.audience !== "SIGNED_IN";
                                                            return (
                                                                <DropdownMenuItem key={kind.kind} disabled={blocked} onSelect={() => addField(screenIndex, kind.kind)} data-testid={`add-field-${kind.kind}`}>
                                                                    <span className="flex-1">{kind.label}</span>
                                                                    {blocked && <span className="text-[11px] text-muted-foreground">signed-in only</span>}
                                                                </DropdownMenuItem>
                                                            );
                                                        })}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </Card>
                                    );
                                })}

                                <Button type="button" variant="outline" className="bg-card" onClick={addScreen} disabled={definition.screens.length >= DEFINITION_LIMITS.screens.max} data-testid="form-add-screen">
                                    <Plus className="mr-1 size-4" />
                                    Add screen
                                </Button>

                                <Card className="space-y-4 rounded-lg border-border p-4 shadow-none">
                                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sending</h3>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="form-submit-label" className="text-xs">
                                                Button label — “Send” when empty
                                            </Label>
                                            <Input id="form-submit-label" value={definition.submitLabel ?? ""} onChange={(event) => change({ ...definition, submitLabel: event.target.value })} maxLength={DEFINITION_LIMITS.submitLabel} className={cn("h-9", showErrors && problems.submitLabel && "border-danger")} data-testid="form-submit-label" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="form-success" className="text-xs">
                                                After sending, the person sees
                                            </Label>
                                            <Input id="form-success" value={definition.successMessage} onChange={(event) => change({ ...definition, successMessage: event.target.value })} maxLength={DEFINITION_LIMITS.successMessage} className={cn("h-9", showErrors && problems.successMessage && "border-danger")} data-testid="form-success" />
                                        </div>
                                    </div>
                                    {showErrors && (problems.submitLabel || problems.successMessage) && <p className="text-xs text-danger">{problems.submitLabel ?? problems.successMessage}</p>}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="form-consent" className="text-xs">
                                            Consent line — ticked before sending, required
                                        </Label>
                                        <Textarea id="form-consent" value={definition.consentText} onChange={(event) => change({ ...definition, consentText: event.target.value })} rows={2} maxLength={DEFINITION_LIMITS.consentText} className={cn(showErrors && problems.consentText && "border-danger")} data-testid="form-consent" />
                                        {showErrors && problems.consentText && <p className="text-xs text-danger">{problems.consentText}</p>}
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-foreground">Which fields carry the person's details</p>
                                        <p className="text-xs text-muted-foreground">Lifted onto every answer, so the table and a lead can name them.</p>
                                        <div className="mt-2 grid gap-3 sm:grid-cols-3">
                                            {(
                                                [
                                                    ["name", "Name", ["text"]],
                                                    ["email", "Email", ["email", "text"]],
                                                    ["phone", "Phone", ["phone", "text"]],
                                                ] as const
                                            ).map(([slot, label, want]) => (
                                                <div key={slot} className="space-y-1.5">
                                                    <Label htmlFor={`contact-${slot}`} className="text-xs">
                                                        {label}
                                                    </Label>
                                                    <Select value={definition.contactMap?.[slot] ?? NONE} onValueChange={(value) => setContact(slot, value)}>
                                                        <SelectTrigger id={`contact-${slot}`} className={cn("h-9", showErrors && problems[`contactMap.${slot}`] && "border-danger")}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value={NONE}>Not asked</SelectItem>
                                                            {contactCandidates([...want]).map((item) => (
                                                                <SelectItem key={item.field.id} value={item.field.id}>
                                                                    {item.field.label || item.field.id}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            </fieldset>
                        </div>

                        <div className="xl:col-span-2">
                            <div className="xl:sticky xl:top-4">
                                <FormPreview definition={definition} title={detail.title} description={detail.description} kinds={kinds} />
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="submissions" className="mt-4">
                    <SubmissionsTab formKey={detail.key} />
                </TabsContent>
            </Tabs>

            <Dialog open={publishOpen} onOpenChange={(open) => busy === null && setPublishOpen(open)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Publish this form?</DialogTitle>
                        <DialogDescription>
                            {dirty ? "Your edits are saved as the draft first. " : ""}
                            Every page with this form asks these questions from now on{detail.live ? `, and version ${detail.live.number} retires` : ""}. Answers already given keep the version they answered.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label htmlFor="form-note">What changed</Label>
                        <Textarea id="form-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={300} placeholder="Asked for the city; dropped the budget question" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPublishOpen(false)} disabled={busy !== null}>
                            Cancel
                        </Button>
                        <Button onClick={() => void onPublish()} disabled={busy !== null} data-testid="form-publish-confirm">
                            {busy === "publish" ? "Publishing…" : "Publish"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={discardOpen}
                onOpenChange={(open) => !open && busy === null && setDiscardOpen(false)}
                title={detail.draft ? `Discard draft v${detail.draft.number}?` : "Undo your changes?"}
                description={detail.draft ? `The draft goes; ${detail.live ? `version ${detail.live.number} stays live` : "nothing is published yet"}. This cannot be undone.` : "The editor goes back to what is saved."}
                confirmLabel={detail.draft ? "Discard" : "Undo"}
                destructive
                busy={busy === "discard"}
                onConfirm={() => void onDiscard()}
            />

            <FormHistorySheet formKey={detail.key} open={historyOpen} onOpenChange={setHistoryOpen} mayRestore={mayPublish} onRestored={onReload} dirty={dirty} />
        </div>
    );
}
