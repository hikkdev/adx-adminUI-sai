"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, ChevronRight, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BulkActions, type BulkAction } from "@/components/adx/bulk-actions";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    FORM_AUDIENCES,
    FORM_AUDIENCE_LABEL,
    FORM_DESTINATIONS,
    FORM_DESTINATION_META,
    badEmails,
    formKeyFrom,
    formKeyProblem,
    formsService,
    parseEmails,
    type FormAudience,
    type FormDestination,
    type FormRow,
} from "@/services/forms";
import { AGENT_JOB_FLOW_KEY, EMPLOYEE_INTAKE_FLOW_KEY, LEAD_LANDING_FLOW_KEY, LISTING_FLOW_KEY, ONBOARDING_FLOW_KEY } from "@/services/flows";
import { LEAD_SIDE_LABEL, type LeadSide } from "@/services/leads";

/**
 * FM-1: every form — what it asks is behind the row; here is where its
 * answers go, who may answer, what is live, what waits, and how many
 * answers nobody has read.
 *
 * 28 Sep 2026: forms are selectable — archive or restore a selection, each
 * the single-form route once per form.
 */
export function FormsView({ forms, onChanged }: { forms: FormRow[]; onChanged: () => void }) {
    const { can } = useAuth();
    const mayEdit = can("content.edit");
    const [creating, setCreating] = React.useState(false);
    const [showArchived, setShowArchived] = React.useState(false);
    const rows = React.useMemo(() => [...forms].filter((form) => showArchived || !form.archivedAt).sort((a, b) => a.title.localeCompare(b.title)), [forms, showArchived]);
    const archivedCount = forms.filter((form) => form.archivedAt).length;
    const liveCount = forms.filter((form) => form.live && !form.archivedAt).length;
    const unread = forms.reduce((sum, form) => sum + (form.submissionsNew ?? 0), 0);
    const bulkActions = formBulkActions({ mayDelete: can("content.delete"), mayEdit });

    return (
        <div className="space-y-5" data-testid="forms-desk">
            <PageHeader
                title="Forms"
                subtitle={`${forms.length - archivedCount} ${forms.length - archivedCount === 1 ? "form" : "forms"}, ${liveCount} live${unread ? `, ${unread} unread ${unread === 1 ? "answer" : "answers"}` : ""}. The questions a page asks and where the answers go — a lead, a support ticket, or the inbox here. A page's Form block names one by its key.`}
                actions={
                    mayEdit ? (
                        <Button onClick={() => setCreating(true)} data-testid="forms-new">
                            <Plus className="mr-1.5 size-4" />
                            New form
                        </Button>
                    ) : undefined
                }
            />

            {archivedCount > 0 && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
                    Show {archivedCount} archived
                </label>
            )}

            {rows.length === 0 ? (
                <Card className="rounded-lg border-border shadow-none">
                    <EmptyState
                        icon={ListChecks}
                        title="No forms yet"
                        description="A form is a set of questions and a place the answers go. Make one, build its screens, publish it, then put it on a page with a Form block."
                        action={mayEdit ? <Button onClick={() => setCreating(true)}>New form</Button> : undefined}
                    />
                </Card>
            ) : (
                <DataTable<FormRow, unknown>
                    columns={FORM_COLUMNS}
                    data={rows}
                    getRowId={(row) => row.key}
                    showColumnToggle={false}
                    showPagination={false}
                    bulkActions={(selected, _clear, keep) => (
                        <BulkActions<FormRow>
                            rows={selected}
                            actions={bulkActions}
                            label={(form) => form.title}
                            onSettled={(outcome) => {
                                keep(outcome.failed.map((failure) => failure.row));
                                onChanged();
                            }}
                        />
                    )}
                />
            )}

            <BuiltInForms />

            {creating && <NewFormDialog takenKeys={forms.map((form) => form.key)} onOpenChange={setCreating} onCreated={onChanged} />}
        </div>
    );
}

/** One of the platform's fixed forms: what it is, and the desk that manages it (`href: null` when no desk does). */
export interface BuiltInForm {
    name: string;
    what: string;
    managedIn: string;
    href: string | null;
}

/**
 * FM-2 (28 Sep 2026): the owner asked why Forms was empty when the platform
 * plainly has forms. It has — but each one writes a record of its own (a
 * listing, a verification, a job, a ticket, a lead), so it is managed where
 * that record lives. This is the map to them.
 */
export const BUILT_IN_FORMS: readonly BuiltInForm[] = [
    { name: "Listing wizard", what: "A publisher lists a space, from the app or the website.", managedIn: "Flow Editor", href: `/flows/${LISTING_FLOW_KEY}` },
    { name: "Onboarding", what: "A publisher or an advertiser sets up their account.", managedIn: "Flow Editor", href: `/flows/${ONBOARDING_FLOW_KEY}` },
    { name: "Agent job checklist", what: "The steps an agent walks through on a job.", managedIn: "Flow Editor", href: `/flows/${AGENT_JOB_FLOW_KEY}` },
    { name: "Employee intake", what: "The papers a new employee hands in for verification.", managedIn: "Flow Editor", href: `/flows/${EMPLOYEE_INTAKE_FLOW_KEY}` },
    { name: "Invite landing", what: "The page an invite link opens, for each side.", managedIn: "Flow Editor", href: `/flows/${LEAD_LANDING_FLOW_KEY}` },
    { name: "Referral form", what: "adx.in/j/r/<code> — a business an account refers. Its questions are fixed in code.", managedIn: "Leads › Sources", href: "/leads/sources" },
    { name: "Print-partner applications", what: "A print shop applies from the app.", managedIn: "Print partners › Directory, the Applications filter", href: "/print-partners/directory" },
    { name: "Support tickets", what: "Somebody raises a problem from the app or the website.", managedIn: "Support", href: "/support" },
    { name: "Design requests", what: "An advertiser asks ADX to design a creative.", managedIn: "Creatives › Design requests", href: "/creatives/design-requests" },
    { name: "Landing-page enquiry form", what: "The enquiry form on an advertiser's campaign landing page.", managedIn: "Managed by the advertiser on their campaign", href: null },
];

/** The platform's fixed forms, each with a link to where it is managed. */
export function BuiltInForms() {
    return (
        <SectionCard
            title="Built into the platform"
            description="These create a listing, a verification, a job, a ticket or a lead directly, so they are managed where that record lives — Forms holds the questions you write yourself."
            contentClassName="p-0"
        >
            <ul className="divide-y" data-testid="built-in-forms">
                {BUILT_IN_FORMS.map((form) => (
                    <li key={form.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{form.name}</p>
                            <p className="text-xs text-muted-foreground">{form.what}</p>
                        </div>
                        {form.href ? (
                            <Link href={form.href} className="inline-flex shrink-0 items-center gap-1 text-sm text-foreground hover:underline">
                                {form.managedIn}
                                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                            </Link>
                        ) : (
                            <span className="shrink-0 text-sm text-muted-foreground">{form.managedIn}</span>
                        )}
                    </li>
                ))}
            </ul>
        </SectionCard>
    );
}

const FORM_COLUMNS: ColumnDef<FormRow>[] = [
    {
        id: "form",
        header: "Form",
        cell: ({ row: { original: row } }) => (
            <div className="min-w-0">
                <Link href={`/content/forms/${encodeURIComponent(row.key)}`} className="font-medium text-foreground hover:underline" data-testid={`form-open-${row.key}`}>
                    {row.title}
                </Link>
                <p className="font-mono text-[11px] text-muted-foreground">{row.key}</p>
            </div>
        ),
    },
    {
        id: "destination",
        header: "Answers go to",
        cell: ({ row: { original: row } }) => (
            <span className="text-sm text-foreground">
                {FORM_DESTINATION_META[row.destination]?.label ?? row.destination}
                {row.destination === "LEAD" && row.leadSide ? <span className="text-muted-foreground"> · {LEAD_SIDE_LABEL[row.leadSide as LeadSide] ?? row.leadSide}</span> : null}
            </span>
        ),
    },
    { id: "audience", header: "Who may answer", cell: ({ row: { original: row } }) => <span className="text-sm text-muted-foreground">{FORM_AUDIENCE_LABEL[row.audience] ?? row.audience}</span> },
    {
        id: "live",
        header: "Live",
        cell: ({ row: { original: row } }) =>
            row.archivedAt ? (
                <StatusBadge status={{ label: "Archived", tone: "neutral" }} />
            ) : row.live ? (
                <span className="text-sm">
                    <StatusBadge status={{ label: `v${row.live.number}`, tone: "success" }} />
                    {row.live.publishedAt && <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(row.live.publishedAt)}</span>}
                </span>
            ) : (
                <StatusBadge status={{ label: "Not published", tone: "warning" }} />
            ),
    },
    {
        id: "draft",
        header: "Draft",
        cell: ({ row: { original: row } }) =>
            row.draft ? (
                <span className="text-sm">
                    <StatusBadge status={{ label: `v${row.draft.number}`, tone: "warning" }} />
                    <span className="ml-2 text-xs text-muted-foreground">saved {formatDateTime(row.draft.updatedAt)}</span>
                </span>
            ) : (
                <span className="text-xs text-muted-foreground">—</span>
            ),
    },
    {
        id: "new",
        header: () => <span className="block text-right">Unread</span>,
        cell: ({ row: { original: row } }) => (
            <span className="flex justify-end">{row.submissionsNew ? <StatusBadge status={{ label: String(row.submissionsNew), tone: "info" }} /> : <span className="text-xs text-muted-foreground">—</span>}</span>
        ),
    },
    { id: "updated", header: "Last change", cell: ({ row: { original: row } }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.updatedAt)}</span> },
    {
        id: "open",
        header: "",
        cell: ({ row: { original: row } }) => (
            <div className="flex justify-end">
                <Button asChild variant="outline" size="sm" className="h-7 bg-card">
                    <Link href={`/content/forms/${encodeURIComponent(row.key)}`}>{row.draft ? "Continue draft" : "Open"}</Link>
                </Button>
            </div>
        ),
    },
];

export const FORM_BULK_BLOCKED = {
    archive: "Archiving a form needs content.delete.",
    restore: "Restoring a form needs content.edit.",
} as const;

/** The Forms list's bulk actions — the archive and restore a form's own page offers, gated as their routes are. */
function formBulkActions({ mayDelete, mayEdit }: { mayDelete: boolean; mayEdit: boolean }): BulkAction<FormRow>[] {
    return [
        {
            key: "archive",
            label: "Archive",
            icon: Archive,
            blocked: mayDelete ? null : FORM_BULK_BLOCKED.archive,
            skip: (form) => (form.archivedAt ? "already archived" : null),
            participle: "archived",
            noun: ["form", "forms"],
            phrase: (count) => `Archive ${count}`,
            description: "Each published form answers 404 until it is restored. Every answer is kept, and the keys stay taken.",
            destructive: true,
            run: (form) => formsService.archive(form.key),
        },
        {
            key: "restore",
            label: "Restore",
            icon: ArchiveRestore,
            blocked: mayEdit ? null : FORM_BULK_BLOCKED.restore,
            skip: (form) => (form.archivedAt ? null : "not archived"),
            participle: "restored",
            noun: ["form", "forms"],
            phrase: (count) => `Restore ${count}`,
            description: "Each answers again with whatever version was live.",
            run: (form) => formsService.restoreForm(form.key),
        },
    ];
}

/**
 * A new form: its settings only. The screens and fields are the draft the
 * editor opens on next; the key never changes once made.
 */
export function NewFormDialog({ takenKeys, onOpenChange, onCreated }: { takenKeys: readonly string[]; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
    const router = useRouter();
    const [title, setTitle] = React.useState("");
    const [key, setKey] = React.useState("");
    const [keyTouched, setKeyTouched] = React.useState(false);
    const [description, setDescription] = React.useState("");
    const [destination, setDestination] = React.useState<FormDestination>("INBOX");
    const [leadSide, setLeadSide] = React.useState<LeadSide>("ADVERTISER");
    const [audience, setAudience] = React.useState<FormAudience>("PUBLIC");
    const [emails, setEmails] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [tried, setTried] = React.useState(false);

    const keyIssue = formKeyProblem(key, takenKeys);
    const titleIssue = title.trim() ? null : "A form needs a title.";
    const emailList = parseEmails(emails);
    const bad = badEmails(emailList);
    const emailIssue = bad.length ? `Not an email: ${bad.join(", ")}` : null;
    const ready = !keyIssue && !titleIssue && !emailIssue;

    async function submit() {
        setTried(true);
        if (!ready || busy) return;
        setBusy(true);
        try {
            await formsService.create({
                key,
                title: title.trim(),
                description: description.trim() || undefined,
                destination,
                leadSide: destination === "LEAD" ? leadSide : undefined,
                audience,
                notifyEmails: emailList,
            });
            toast.success(`“${title.trim()}” made`, { description: "Build its screens, then publish it." });
            onCreated();
            onOpenChange(false);
            router.push(`/content/forms/${encodeURIComponent(key)}`);
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The form was not made.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(next) => (!next && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>New form</DialogTitle>
                    <DialogDescription>Where the answers go and who may answer. The questions come next, on the form's own page.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="new-form-title">Title</Label>
                            <Input
                                id="new-form-title"
                                value={title}
                                onChange={(event) => {
                                    setTitle(event.target.value);
                                    if (!keyTouched) setKey(formKeyFrom(event.target.value));
                                }}
                                placeholder="Event sign-up"
                                autoFocus
                                data-testid="new-form-title"
                            />
                            <p className={cn("text-xs", tried && titleIssue ? "text-danger" : "text-muted-foreground")}>{(tried && titleIssue) || "What the person sees at the top."}</p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="new-form-key">Key — never changes</Label>
                            <Input
                                id="new-form-key"
                                value={key}
                                onChange={(event) => {
                                    setKeyTouched(true);
                                    setKey(event.target.value);
                                }}
                                placeholder="event-signup"
                                className="font-mono"
                                data-testid="new-form-key"
                            />
                            <p className={cn("text-xs", (tried || key) && keyIssue ? "text-danger" : "text-muted-foreground")} data-testid="new-form-key-hint">
                                {((tried || key) && keyIssue) || "What a page's Form block names."}
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="new-form-description">Description</Label>
                        <Input id="new-form-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="One line under the title, for the person answering" data-testid="new-form-description" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid content-start gap-1.5">
                            <Label htmlFor="new-form-destination">Answers go to</Label>
                            <Select value={destination} onValueChange={(value) => setDestination(value as FormDestination)}>
                                <SelectTrigger id="new-form-destination" data-testid="new-form-destination">
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
                            <p className="text-xs text-muted-foreground">{FORM_DESTINATION_META[destination].blurb}</p>
                        </div>
                        {destination === "LEAD" ? (
                            <div className="grid content-start gap-1.5">
                                <Label htmlFor="new-form-side">A lead for</Label>
                                <Select value={leadSide} onValueChange={(value) => setLeadSide(value as LeadSide)}>
                                    <SelectTrigger id="new-form-side" data-testid="new-form-side">
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
                                <p className="text-xs text-muted-foreground">Which side's pipeline the lead joins.</p>
                            </div>
                        ) : (
                            <div className="grid content-start gap-1.5">
                                <Label htmlFor="new-form-audience">Who may answer</Label>
                                <Select value={audience} onValueChange={(value) => setAudience(value as FormAudience)}>
                                    <SelectTrigger id="new-form-audience" data-testid="new-form-audience">
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
                                <p className="text-xs text-muted-foreground">A file upload field needs signed-in accounts.</p>
                            </div>
                        )}
                    </div>
                    {destination === "LEAD" && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="new-form-audience-2">Who may answer</Label>
                            <Select value={audience} onValueChange={(value) => setAudience(value as FormAudience)}>
                                <SelectTrigger id="new-form-audience-2">
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
                    )}
                    <div className="grid gap-1.5">
                        <Label htmlFor="new-form-emails">Email when an answer arrives</Label>
                        <Textarea id="new-form-emails" value={emails} onChange={(event) => setEmails(event.target.value)} rows={2} placeholder="ops@adx.in, sales@adx.in" data-testid="new-form-emails" />
                        <p className={cn("text-xs", emailIssue ? "text-danger" : "text-muted-foreground")}>{emailIssue ?? "Comma-separated; leave empty for nobody."}</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={busy} data-testid="new-form-submit">
                        {busy ? "Making…" : "Make and build"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
