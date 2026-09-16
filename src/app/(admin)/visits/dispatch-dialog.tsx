"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { advertiserService } from "@/services/advertisers";
import { agentLabel, type AgentSummary } from "@/services/agents";
import { leadsService } from "@/services/leads";
import { supplyService } from "@/services/supply";
import {
    VISIT_KINDS,
    VISIT_KIND_LABEL,
    visitsService,
    type DispatchVisitInput,
    type VisitKind,
} from "@/services/visits";

interface DispatchVisitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The roster, already fetched once for the board. */
    agents: AgentSummary[];
    /** Called after the visit actually lands, so the board refetches. */
    onDispatched: () => void;
}

/**
 * Sending an agent somewhere.
 *
 * A visit is to exactly one lead, publisher or advertiser — the table's
 * check constraint says so and the schema refuses a body with two or none —
 * so the party is picked first, from the list that side already keeps, and
 * the record chosen fills in the business and where it is. Those stay
 * editable: a lead's locality is whatever the agent typed on the pavement,
 * and the visit should say where the trip actually goes.
 *
 * The result is an OFFER, not an assignment. The agent gets the same
 * 25-minute clock an order offer gets, and the board's Requested column
 * shows it counting down; nothing here pretends otherwise.
 */
export function DispatchVisitDialog({ open, onOpenChange, agents, onDispatched }: DispatchVisitDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                {/* Mounted only while open, so the party list is fetched when
                    somebody opens the dialog and not on every board load. */}
                <DispatchForm agents={agents} onClose={() => onOpenChange(false)} onDispatched={onDispatched} />
            </DialogContent>
        </Dialog>
    );
}

type Party = "LEAD" | "PUBLISHER" | "ADVERTISER";

const PARTIES: { value: Party; label: string; description: string }[] = [
    { value: "LEAD", label: "Lead", description: "A business not yet on the marketplace." },
    { value: "PUBLISHER", label: "Publisher", description: "A publisher already on the roster." },
    { value: "ADVERTISER", label: "Advertiser", description: "An advertiser account." },
];

/** One record the picker can offer, and what it fills in when chosen. */
interface PartyOption {
    id: string;
    name: string;
    locality: string | null;
    city: string | null;
    /** Searchable, under the name: the identifier and where it is. */
    description: string;
}

/**
 * The list for one side, from the service that side already keeps.
 *
 * No new endpoints: leads through the desk's own page, publishers through
 * the roster, advertisers through the list. Each is the whole side (or the
 * first hundred leads, newest first), and the picker searches it locally.
 */
async function loadParty(party: Party): Promise<PartyOption[]> {
    switch (party) {
        case "LEAD": {
            const page = await leadsService.list({ sort: "NEWEST", pageSize: 100 });
            return page.items.map((lead) => ({
                id: lead.id,
                name: lead.businessName,
                locality: lead.locality,
                city: lead.city,
                description: [lead.displayId, lead.locality, lead.city].filter(Boolean).join(" · "),
            }));
        }
        case "PUBLISHER": {
            const rows = await supplyService.roster();
            return rows.map((publisher) => ({
                id: publisher.id,
                name: publisher.name,
                locality: null,
                city: publisher.city,
                description: [publisher.displayId, publisher.city].filter(Boolean).join(" · "),
            }));
        }
        case "ADVERTISER": {
            const rows = await advertiserService.list();
            return rows.map((advertiser) => ({
                id: advertiser.id,
                // The company, when there is one: that is the door the agent
                // knocks on. The account name stands in otherwise.
                name: advertiser.companyName?.trim() || advertiser.name,
                locality: null,
                city: advertiser.city,
                description: [advertiser.displayId, advertiser.city].filter(Boolean).join(" · "),
            }));
        }
    }
}

const EMPTY = { businessName: "", locality: "", city: "", scheduledFor: "", notes: "" };

function DispatchForm({
    agents,
    onClose,
    onDispatched,
}: {
    agents: AgentSummary[];
    onClose: () => void;
    onDispatched: () => void;
}) {
    const live = isLive("visits");
    const [kind, setKind] = React.useState<VisitKind>("ONBOARDING");
    const [party, setParty] = React.useState<Party>("LEAD");
    const [partyId, setPartyId] = React.useState("");
    const [agentId, setAgentId] = React.useState("");
    const [fields, setFields] = React.useState(EMPTY);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const options = useApiResource<PartyOption[]>(`visits:party:${party}:${live}`, () =>
        live ? loadParty(party) : Promise.resolve([]),
    );

    const partyItems = React.useMemo<ComboboxItem[]>(
        () =>
            (options.data ?? []).map((option) => ({
                value: option.id,
                label: option.name,
                description: option.description || undefined,
            })),
        [options.data],
    );

    const agentItems = React.useMemo<ComboboxItem[]>(
        () => agents.map((agent) => ({ value: agent.id, label: agentLabel(agent) })),
        [agents],
    );

    const set =
        (key: keyof typeof EMPTY) =>
        (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setFields((current) => ({ ...current, [key]: event.target.value }));

    function chooseParty(next: Party) {
        // A different side is a different list; the pick and what it filled
        // in do not carry over.
        setParty(next);
        setPartyId("");
        setFields((current) => ({ ...current, businessName: "", locality: "", city: "" }));
    }

    function chooseRecord(id: string) {
        setPartyId(id);
        const chosen = (options.data ?? []).find((option) => option.id === id);
        if (!chosen) return;
        // Filled from the record and left editable — the visit should say
        // where the trip actually goes.
        setFields((current) => ({
            ...current,
            businessName: chosen.name,
            locality: chosen.locality ?? "",
            city: chosen.city ?? "",
        }));
    }

    const ready = partyId !== "" && agentId !== "" && fields.businessName.trim().length > 0;
    const agentName = agents.find((agent) => agent.id === agentId);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;

        // Optional fields go on the wire only when filled: the schema's
        // `min(1)` would refuse an empty string.
        const input: DispatchVisitInput = {
            kind,
            agentId,
            ...(party === "LEAD" ? { leadId: partyId } : {}),
            ...(party === "PUBLISHER" ? { publisherId: partyId } : {}),
            ...(party === "ADVERTISER" ? { advertiserId: partyId } : {}),
            businessName: fields.businessName.trim(),
            ...(fields.locality.trim() ? { locality: fields.locality.trim() } : {}),
            ...(fields.city.trim() ? { city: fields.city.trim() } : {}),
            ...(fields.scheduledFor ? { scheduledFor: new Date(fields.scheduledFor).toISOString() } : {}),
            ...(fields.notes.trim() ? { notes: fields.notes.trim() } : {}),
        };

        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const visit = await visitsService.dispatch(input);
            // Said only once the API answered, and said as what it is: an
            // offer with a clock, not a done deal.
            toast.success(
                `${visit.businessName} offered to ${agentName ? agentLabel(agentName) : agentId}`,
                { description: `They have 25 minutes to accept${visit.displayId ? ` · ${visit.displayId}` : ""}.` },
            );
            onDispatched();
            onClose();
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not dispatch the visit.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Dispatch a visit</DialogTitle>
                <DialogDescription>
                    Sends an offer to the agent's phone. They have 25 minutes to accept before it
                    comes back to this board as expired.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="visit-kind" label="Kind of visit">
                    <Select value={kind} onValueChange={(value) => setKind(value as VisitKind)}>
                        <SelectTrigger id="visit-kind" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {VISIT_KINDS.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {VISIT_KIND_LABEL[value]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
                <Field id="visit-agent" label="Agent" errors={fieldErrors.agentId}>
                    <Combobox
                        id="visit-agent"
                        items={agentItems}
                        value={agentId}
                        onValueChange={setAgentId}
                        placeholder="Pick an agent"
                        searchPlaceholder="Search the roster…"
                        emptyText={agents.length === 0 ? "The roster did not load." : "No agent matches."}
                    />
                </Field>
            </div>

            <div className="grid gap-1.5">
                <Label>Who the visit is to</Label>
                <RadioGroup
                    value={party}
                    onValueChange={(value) => chooseParty(value as Party)}
                    className="grid gap-2 sm:grid-cols-3"
                >
                    {PARTIES.map((option) => (
                        <label
                            key={option.value}
                            htmlFor={`party-${option.value}`}
                            className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card p-3 text-left"
                        >
                            <RadioGroupItem id={`party-${option.value}`} value={option.value} className="mt-0.5" />
                            <span>
                                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {option.description}
                                </span>
                            </span>
                        </label>
                    ))}
                </RadioGroup>
            </div>

            <Field
                id="visit-party"
                label={PARTIES.find((option) => option.value === party)?.label ?? "Record"}
                errors={fieldErrors.leadId ?? fieldErrors.publisherId ?? fieldErrors.advertiserId}
                hint={
                    options.error
                        ? options.error
                        : options.loading
                          ? "Loading the list…"
                          : "Choosing one fills in the business and where it is."
                }
            >
                <Combobox
                    id="visit-party"
                    items={partyItems}
                    value={partyId}
                    onValueChange={chooseRecord}
                    disabled={options.loading}
                    placeholder={options.loading ? "Loading…" : "Type to search"}
                    searchPlaceholder="Search by name, identifier or city…"
                    emptyText="No record matches."
                />
            </Field>

            <Field id="visit-business" label="Business" errors={fieldErrors.businessName}>
                <Input
                    id="visit-business"
                    value={fields.businessName}
                    onChange={set("businessName")}
                    autoComplete="off"
                    placeholder="Sri Balaji Sweets"
                />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field id="visit-locality" label="Locality" optional errors={fieldErrors.locality}>
                    <Input
                        id="visit-locality"
                        value={fields.locality}
                        onChange={set("locality")}
                        autoComplete="off"
                        placeholder="Jayanagar 4th Block"
                    />
                </Field>
                <Field id="visit-city" label="City" optional errors={fieldErrors.city}>
                    <Input
                        id="visit-city"
                        value={fields.city}
                        onChange={set("city")}
                        autoComplete="off"
                        placeholder="Bengaluru"
                    />
                </Field>
            </div>

            <Field
                id="visit-when"
                label="Slot"
                optional
                hint="Leave it empty and the agent picks a time on accepting."
                errors={fieldErrors.scheduledFor}
            >
                <Input
                    id="visit-when"
                    type="datetime-local"
                    value={fields.scheduledFor}
                    onChange={set("scheduledFor")}
                />
            </Field>

            <Field id="visit-notes" label="Notes for the agent" optional errors={fieldErrors.notes}>
                <Textarea
                    id="visit-notes"
                    value={fields.notes}
                    onChange={set("notes")}
                    rows={2}
                    placeholder="Ask for the shutter and the side wall to be measured."
                />
            </Field>

            {formError && (
                <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
            )}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!live || !ready || busy}>
                    {busy ? "Sending…" : "Send the offer"}
                </Button>
            </DialogFooter>
        </form>
    );
}

function Field({
    id,
    label,
    hint,
    optional,
    errors,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    optional?: boolean;
    errors?: string[];
    children: React.ReactNode;
}) {
    const error = errors?.[0];
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>
                {label}
                {optional && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
            </Label>
            {children}
            {error ? (
                <p className="text-xs text-danger">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
