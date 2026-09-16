"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/adx/city-combobox";
import { FileDropzone } from "@/components/adx/file-dropzone";
import { FormatGuidePanel } from "@/components/adx/party-import/format-guide-panel";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { advertiserService } from "@/services/advertisers";
import { agentLabel, type AgentSummary } from "@/services/agents";
import {
    IMPORT_OUTCOME_META,
    LEAD_SIDE_LABEL,
    leadsService,
    parseLeadCsv,
    type CreateLeadInput,
    type ImportResult,
    type Lead,
    type LeadSide,
    type ParsedLeadCsv,
} from "@/services/leads";
import { supplyService } from "@/services/supply";

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

interface ImportLeadsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImported: (result: ImportResult) => void;
}

/**
 * Lot D (Q93): a sheet in, a report out, then the commit.
 *
 * Three steps, in order and never skipped: the CSV is parsed here (a row the
 * schema would refuse fails the whole batch, so the sheet is checked before
 * a byte goes up); `dryRun: true` answers with the per-row report and
 * writes nothing; Commit sends the same rows again without the flag and the
 * created ones come back with their LED- numbers.
 */
export function ImportLeadsDialog({ open, onOpenChange, onImported }: ImportLeadsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                {open && <ImportForm onImported={onImported} onClose={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function ImportForm({ onImported, onClose }: { onImported: (result: ImportResult) => void; onClose: () => void }) {
    const [source, setSource] = React.useState("");
    const [file, setFile] = React.useState<File | null>(null);
    const [pasted, setPasted] = React.useState("");
    const [parsed, setParsed] = React.useState<ParsedLeadCsv | null>(null);
    const [preview, setPreview] = React.useState<ImportResult | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /* The sheet is re-read whenever the file or the paste changes, and the
       preview is dropped: a report belongs to the rows it was made from. */
    React.useEffect(() => {
        let active = true;
        const read = async () => {
            const text = file ? await file.text() : pasted;
            if (!active) return;
            setParsed(text.trim() ? parseLeadCsv(text) : null);
            setPreview(null);
        };
        void read();
        return () => {
            active = false;
        };
    }, [file, pasted]);

    const rows = parsed?.rows ?? [];
    const problems = parsed?.problems ?? [];
    const tooMany = rows.length > 500;
    const canCheck = source.trim().length > 0 && rows.length > 0 && problems.length === 0 && !tooMany;

    async function run(dryRun: boolean) {
        if (!canCheck || busy) return;
        setBusy(true);
        setError(null);
        try {
            const result = await leadsService.import(source.trim(), rows, dryRun);
            if (dryRun) {
                setPreview(result);
            } else {
                toast.success(`${result.imported} lead${result.imported === 1 ? "" : "s"} imported`, {
                    description: `${result.skipped} skipped, ${result.warnings} with a warning. Recorded as LEADS_IMPORTED.`,
                });
                onImported(result);
                onClose();
            }
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "The import did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <DialogHeader>
                <DialogTitle>Import leads</DialogTitle>
                <DialogDescription>
                    A CSV with a header row — <span className="font-mono text-xs">side, businessName, phone, city</span> and the
                    rest of the create fields. Up to 500 rows in one transaction; the check reports every row before anything
                    is written.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
                <Label htmlFor="import-source">Source</Label>
                <Input
                    id="import-source"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="Koramangala walk sheet, September"
                    className="h-9"
                    maxLength={120}
                />
                <p className="text-xs text-muted-foreground">Written on every lead the sheet creates.</p>
            </div>

            {/* Package U: the server's own guide to the columns, folded — the file is the point here. */}
            <FormatGuidePanel kind="leads" collapsible />

            <FileDropzone accept={[".csv", ".txt"]} file={file} onFile={setFile} hint="CSV, up to 500 rows" disabled={busy} />

            {!file && (
                <div className="grid gap-1.5">
                    <Label htmlFor="import-paste">Or paste the rows</Label>
                    <Textarea
                        id="import-paste"
                        value={pasted}
                        onChange={(event) => setPasted(event.target.value)}
                        rows={5}
                        className="font-mono text-xs"
                        placeholder={"side,businessName,phone,city,category\nPUBLISHER,Sharma Stationers,9876543210,Bengaluru,Stationery"}
                    />
                </div>
            )}

            {parsed && (
                <div className="rounded-lg border p-3 text-sm">
                    <p className="text-foreground">
                        <span className="font-medium">{rows.length}</span> row{rows.length === 1 ? "" : "s"} read
                        {parsed.ignored.length > 0 && (
                            <span className="text-muted-foreground"> · ignored columns: {parsed.ignored.join(", ")}</span>
                        )}
                    </p>
                    {tooMany && <p className="mt-1 text-danger">More than 500 rows — split the sheet; one request cannot be a migration.</p>}
                    {problems.length > 0 && (
                        <div className="mt-2">
                            <p className="text-danger">
                                {problems.length} row{problems.length === 1 ? "" : "s"} the API would refuse — and one bad row fails the
                                whole sheet. Fix these first.
                            </p>
                            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                                {problems.slice(0, 50).map((problem, index) => (
                                    <li key={`${problem.row}-${index}`}>
                                        Row {problem.row}: {problem.message}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {preview && <ImportReport result={preview} />}

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                {!preview ? (
                    <Button type="button" disabled={!canCheck || busy} onClick={() => void run(true)}>
                        {busy ? "Checking…" : "Check the sheet"}
                    </Button>
                ) : (
                    <Button type="button" disabled={busy || preview.imported === 0} onClick={() => void run(false)}>
                        {busy ? "Importing…" : `Commit ${preview.imported} lead${preview.imported === 1 ? "" : "s"}`}
                    </Button>
                )}
            </DialogFooter>
        </div>
    );
}

/** The per-row report, from a dry run or the commit. */
export function ImportReport({ result }: { result: ImportResult }) {
    return (
        <div className="rounded-lg border" data-testid="import-report">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{result.dryRun ? "What the import would do" : "What the import did"}</span>
                <span className="text-muted-foreground">
                    {result.imported} to create · {result.skipped} skipped · {result.warnings} with a warning
                </span>
            </div>
            <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
                        <tr>
                            <th className="px-3 py-1.5 font-medium">Row</th>
                            <th className="px-3 py-1.5 font-medium">Outcome</th>
                            <th className="px-3 py-1.5 font-medium">Ref</th>
                            <th className="px-3 py-1.5 font-medium">Message</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {result.report.map((entry) => (
                            <tr key={entry.row}>
                                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{entry.row}</td>
                                <td className="px-3 py-1.5">
                                    <StatusBadge status={IMPORT_OUTCOME_META[entry.outcome]} />
                                </td>
                                <td className="px-3 py-1.5 font-mono text-xs">{entry.ref ?? "—"}</td>
                                <td className="px-3 py-1.5 text-muted-foreground">{entry.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

interface CreateLeadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    agents: AgentSummary[];
    onCreated: (lead: Lead) => void;
}

const OPEN_POOL = "__open_pool__";
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/** `POST /leads` — one lead, from the desk. */
export function CreateLeadDialog({ open, onOpenChange, agents, onCreated }: CreateLeadDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                {open && <CreateForm agents={agents} onCreated={onCreated} onClose={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function CreateForm({ agents, onCreated, onClose }: Omit<CreateLeadDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
    const [side, setSide] = React.useState<LeadSide>("PUBLISHER");
    const [fields, setFields] = React.useState({
        businessName: "",
        category: "",
        contactName: "",
        phone: "",
        email: "",
        address: "",
        locality: "",
        city: "",
        interest: "",
        source: "",
        estimatedCommission: "",
    });
    const [agentId, setAgentId] = React.useState(OPEN_POOL);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const set = (key: keyof typeof fields) => (event: React.ChangeEvent<HTMLInputElement>) =>
        setFields((current) => ({ ...current, [key]: event.target.value }));
    const estimateOk = fields.estimatedCommission.trim() === "" || AMOUNT.test(fields.estimatedCommission.trim());
    const ready = fields.businessName.trim().length > 0 && estimateOk;

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setFieldErrors({});
        // Only keys with a value go up: the schema treats an absent key and
        // an empty string differently, and refuses the latter.
        const input: CreateLeadInput = { side, businessName: fields.businessName.trim() };
        (Object.keys(fields) as (keyof typeof fields)[]).forEach((key) => {
            if (key === "businessName") return;
            const value = fields[key].trim();
            if (value) input[key] = value;
        });
        if (agentId !== OPEN_POOL) input.assignedAgentId = agentId;
        try {
            const lead = await leadsService.create(input);
            toast.success(`${lead.businessName} added as ${lead.displayId ?? lead.id}`);
            onCreated(lead);
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                const reason = (cause.details as { reason?: string } | undefined)?.reason;
                setError(
                    reason === "DUPLICATE_LEAD"
                        ? `${cause.message} — this number is already on a lead.`
                        : reason === "EXISTING_ACCOUNT"
                          ? `${cause.message} — this number belongs to an account, not a prospect.`
                          : cause.message
                );
            } else {
                setError(cause instanceof Error ? cause.message : "Could not create the lead.");
            }
        } finally {
            setBusy(false);
        }
    }

    const field = (key: keyof typeof fields, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <div className="grid gap-1.5">
            <Label htmlFor={`lead-${key}`}>{label}</Label>
            <Input id={`lead-${key}`} value={fields[key]} onChange={set(key)} className="h-9" {...props} />
            {fieldErrors[key]?.[0] && <p className="text-xs text-danger">{fieldErrors[key][0]}</p>}
        </div>
    );

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Create lead</DialogTitle>
                <DialogDescription>
                    A business an agent can go and see. The number is checked against every lead and both account tables;
                    the estimate is quoted from the live rate when left blank.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <Label htmlFor="lead-side">Side</Label>
                    <Select value={side} onValueChange={(value) => setSide(value as LeadSide)}>
                        <SelectTrigger id="lead-side" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(["PUBLISHER", "ADVERTISER"] as LeadSide[]).map((value) => (
                                <SelectItem key={value} value={value}>
                                    {LEAD_SIDE_LABEL[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {field("businessName", "Business", { placeholder: "Sharma Stationers", maxLength: 160, autoFocus: true })}
                {field("category", "Category", { placeholder: "Stationery, Gym, Cafe…", maxLength: 60 })}
                {field("contactName", "Contact", { maxLength: 120 })}
                {field("phone", "Phone", { inputMode: "tel", placeholder: "9876543210" })}
                {field("email", "Email", { inputMode: "email" })}
                {field("locality", "Locality", { maxLength: 120 })}
                <div className="grid gap-1.5">
                    <Label htmlFor="lead-city">City</Label>
                    <CityCombobox
                        id="lead-city"
                        value={fields.city}
                        onChange={(city) => setFields((current) => ({ ...current, city }))}
                        stages={["LAUNCHED", "SEEDING"]}
                        maxLength={80}
                        className="[&_input]:h-9"
                    />
                    {fieldErrors.city?.[0] && <p className="text-xs text-danger">{fieldErrors.city[0]}</p>}
                </div>
                {field("interest", "Interest", { placeholder: "What they asked about", maxLength: 200 })}
                {field("source", "Source", { placeholder: "Walk-in, referral…", maxLength: 120 })}
                {field("estimatedCommission", "Est. commission", { inputMode: "decimal", placeholder: "Quoted from the rate if blank" })}
                <div className="grid gap-1.5">
                    <Label htmlFor="lead-agent">Assign to</Label>
                    <Select value={agentId} onValueChange={setAgentId}>
                        <SelectTrigger id="lead-agent" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={OPEN_POOL}>Open pool</SelectItem>
                            {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>
                                    {agentLabel(agent)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {field("address", "Address", { maxLength: 300 })}
            {!estimateOk && <p className="text-xs text-danger">The estimate is an amount like 1450 or 1450.00.</p>}

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Creating…" : "Create lead"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* Convert                                                             */
/* ------------------------------------------------------------------ */

interface ConvertLeadDialogProps {
    lead: Lead | null;
    onOpenChange: (open: boolean) => void;
    onConverted: (lead: Lead) => void;
}

/**
 * `POST /leads/:id/convert` — the account the lead became.
 *
 * The picker is the roster of the side the lead was prospected for: the
 * publishers or the advertisers, by name and mobile. "Link by number" sends
 * nothing and lets the server match the lead's phone against both tables —
 * the answer for a shop that signed itself up after the visit.
 */
export function ConvertLeadDialog({ lead, onOpenChange, onConverted }: ConvertLeadDialogProps) {
    return (
        <Dialog open={lead !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {lead && <ConvertForm lead={lead} onConverted={onConverted} onClose={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function ConvertForm({ lead, onConverted, onClose }: { lead: Lead; onConverted: (lead: Lead) => void; onClose: () => void }) {
    const [accountId, setAccountId] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const accounts = useApiResource<{ label: string; value: string; description?: string }[]>(`leads:convert:${lead.side}`, async () =>
        lead.side === "PUBLISHER"
            ? (await supplyService.roster()).map((row) => ({
                  label: row.name,
                  value: row.id,
                  description: [row.displayId, row.mobile, row.city].filter(Boolean).join(" · "),
              }))
            : (await advertiserService.list()).map((row) => ({
                  label: row.name,
                  value: row.id,
                  description: [row.displayId, row.contact, row.city].filter(Boolean).join(" · "),
              }))
    );

    async function submit(byNumber: boolean) {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const target = byNumber ? {} : lead.side === "PUBLISHER" ? { publisherId: accountId } : { advertiserId: accountId };
            const converted = await leadsService.convert(lead.id, target);
            toast.success(`${lead.businessName} converted`, { description: "The funnel counts it once; the lead leaves the agents' lists." });
            onConverted(converted);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not convert the lead.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <DialogHeader>
                <DialogTitle>Convert {lead.businessName}</DialogTitle>
                <DialogDescription>
                    Which {LEAD_SIDE_LABEL[lead.side].toLowerCase()} account this lead became. A lead converts exactly once; the
                    number on it is checked against both account tables, and naming a different account than the number
                    belongs to is refused.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
                <Label htmlFor="convert-account">{LEAD_SIDE_LABEL[lead.side]} account</Label>
                <Combobox
                    id="convert-account"
                    items={accounts.data ?? []}
                    value={accountId}
                    onValueChange={setAccountId}
                    placeholder={accounts.loading ? "Loading the roster…" : "Pick the account"}
                    searchPlaceholder="Name, number or id"
                    emptyText={accounts.error ?? "No account matches."}
                />
            </div>

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter className="gap-2 sm:justify-between">
                <Button
                    type="button"
                    variant="outline"
                    className="bg-card"
                    disabled={busy || !lead.phone}
                    title={lead.phone ? undefined : "The lead has no number to match"}
                    onClick={() => void submit(true)}
                >
                    Link the account its number belongs to
                </Button>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={busy || !accountId} onClick={() => void submit(false)}>
                        {busy ? "Converting…" : "Convert"}
                    </Button>
                </div>
            </DialogFooter>
        </div>
    );
}
