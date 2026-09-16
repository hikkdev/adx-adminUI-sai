"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { CityCombobox } from "./city-combobox";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { agentLabel, agentService, type AgentSummary } from "@/services/agents";
import {
    PUBLISHER_TYPES,
    PUBLISHER_TYPE_LABEL,
    publishersService,
    type CreatedPublisher,
    type PublisherType,
} from "@/services/publishers";

/**
 * The honest "Add a publisher" form — `POST /publishers` from the desk.
 *
 * Born on the dashboard card (Lot A) and shared since Lot D with the
 * publishers page's "Add publisher" dialog, so the console has one form
 * for opening an account and one set of words about what happens next:
 * the fields are the schema's, the number is required, the email is not,
 * and the success state says the owner claims the account by signing in
 * with that number — nothing sends a link.
 *
 * "Attribute to agent" is Q29: an admin's publisher goes on nobody's book
 * unless the admin names an agent, and the picker searches `GET /agents`
 * rather than holding the roster.
 */

/** What happened, and what happens next — no link was sent, so none is promised. */
export function CreatedState({ publisher, onAnother }: { publisher: CreatedPublisher; onAnother: () => void }) {
    return (
        <div className="mt-4 flex flex-1 flex-col gap-4">
            <div className="rounded-md bg-success-soft px-4 py-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-success">
                    <Check className="size-4" aria-hidden />
                    {publisher.name} is on the roster
                    {publisher.displayId ? <span className="font-mono text-xs">{publisher.displayId}</span> : null}
                </p>
                <p className="mt-1.5 text-foreground">
                    The owner claims the account by signing in to the publisher app with{" "}
                    <span className="font-mono">{publisher.mobile}</span>. There is nothing to send them: the number is
                    the invitation.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                    {publisher.agentId ? "Attributed to the agent you named." : "On nobody's book — no agent is credited."}
                </p>
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                <Button variant="ghost" size="sm" onClick={onAnother}>
                    Add another
                </Button>
                <Button asChild>
                    <Link href={`/publishers/${publisher.id}`}>Open the publisher</Link>
                </Button>
            </div>
        </div>
    );
}

/** The schema's floor: ten characters, which is what the server normalises from. */
const MOBILE_MIN = 10;

export function AddPublisherForm({ onCreated }: { onCreated: (publisher: CreatedPublisher) => void }) {
    const [name, setName] = React.useState("");
    const [mobile, setMobile] = React.useState("");
    const [type, setType] = React.useState<PublisherType>("INDIVIDUAL");
    const [city, setCity] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [agent, setAgent] = React.useState<AgentSummary | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

    const ready = name.trim().length > 0 && mobile.trim().length >= MOBILE_MIN;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const publisher = await publishersService.create({
                name,
                mobile,
                type,
                city,
                email,
                ...(agent ? { attributeToAgentId: agent.id } : {}),
            });
            // Said only after the API answered: a toast for a write that did
            // not happen is an account nobody can sign in to.
            toast.success(`${publisher.name} added`, {
                description: publisher.displayId ?? "Identifier not minted",
            });
            onCreated(publisher);
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setError(cause.message);
            } else {
                setError(cause instanceof Error ? cause.message : "Could not open the account.");
            }
        } finally {
            setBusy(false);
        }
    }

    const fieldError = (key: string) => fieldErrors[key]?.[0];

    return (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-1 flex-col gap-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="qa-business">Business name</Label>
                    <Input
                        id="qa-business"
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="e.g. Sharma Hoardings"
                        className="h-9"
                    />
                    {fieldError("name") && <p className="text-xs text-danger">{fieldError("name")}</p>}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="qa-mobile">Owner mobile</Label>
                    <Input
                        id="qa-mobile"
                        type="tel"
                        inputMode="tel"
                        required
                        value={mobile}
                        onChange={(event) => setMobile(event.target.value)}
                        placeholder="The number they will sign in with"
                        className="h-9"
                    />
                    {fieldError("mobile") && <p className="text-xs text-danger">{fieldError("mobile")}</p>}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="qa-type">Business type</Label>
                    <Select value={type} onValueChange={(value) => setType(value as PublisherType)}>
                        <SelectTrigger id="qa-type" className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PUBLISHER_TYPES.map((option) => (
                                <SelectItem key={option} value={option}>
                                    {PUBLISHER_TYPE_LABEL[option]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="qa-city">City</Label>
                    <CityCombobox id="qa-city" value={city} onChange={setCity} stages={["LAUNCHED", "SEEDING"]} placeholder="e.g. Bengaluru" className="[&_input]:h-9" />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="qa-email">
                    Email <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                    id="qa-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="owner@business.in"
                    className="h-9"
                />
                {fieldError("email") && <p className="text-xs text-danger">{fieldError("email")}</p>}
            </div>

            <AgentPicker value={agent} onChange={setAgent} />

            {error && (
                <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                </p>
            )}

            <div className="mt-auto flex justify-end pt-1">
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Opening…" : "Add publisher"}
                </Button>
            </div>
        </form>
    );
}

/**
 * "Attribute to agent" — a search over `GET /agents?search=`.
 *
 * Optional, and blank by default on purpose: attribution is never implied,
 * and a publisher opened at the desk goes on nobody's book unless ops says
 * whose. Once picked, the agent is shown as a chip with a clear.
 */
function AgentPicker({ value, onChange }: { value: AgentSummary | null; onChange: (agent: AgentSummary | null) => void }) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);
    const matches = useApiResource<AgentSummary[]>(`dashboard:agent-search:${q}`, () =>
        q.length >= 2 ? agentService.search(q) : Promise.resolve([]),
    );

    if (value) {
        return (
            <div className="space-y-1.5">
                <Label>Attributed to</Label>
                <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <span className="truncate">
                        {agentLabel(value)}
                        {value.displayId ? <span className="ml-2 font-mono text-xs text-muted-foreground">{value.displayId}</span> : null}
                    </span>
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label="Clear the agent"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>
        );
    }

    const rows = matches.data ?? [];

    return (
        <div className="space-y-1.5">
            <Label htmlFor="qa-agent">
                Attribute to agent <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
                id="qa-agent"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents by name or mobile"
                className="h-9"
                autoComplete="off"
            />
            {q.length >= 2 && (
                <div className="rounded-md border text-sm" role="listbox" aria-label="Matching agents">
                    {matches.loading && rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                    ) : matches.error ? (
                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">No agent matches "{q}".</p>
                    ) : (
                        <ul className="max-h-40 divide-y overflow-y-auto">
                            {rows.map((row) => (
                                <li key={row.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onClick={() => {
                                            onChange(row);
                                            setQuery("");
                                        }}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                                    >
                                        <span className="truncate">{agentLabel(row)}</span>
                                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                            {row.displayId ?? row.user?.mobile ?? ""}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
