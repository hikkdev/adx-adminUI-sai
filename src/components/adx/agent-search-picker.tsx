"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { agentLabel, agentService, type AgentSummary } from "@/services/agents";

interface AgentSearchPickerProps {
    id: string;
    label: React.ReactNode;
    value: AgentSummary | null;
    onChange: (agent: AgentSummary | null) => void;
    /** An agent the list should not offer — the one already holding the order, say. */
    excludeId?: string | null;
    placeholder?: string;
}

/**
 * An agent, found by name or mobile over `GET /agents?search=`.
 *
 * For the dialogs that cannot hold the whole roster: reassigning an order,
 * naming the agent a re-install goes to. Once picked, the agent is shown as
 * a chip with a clear, and the id that leaves here is one the API issued.
 */
export function AgentSearchPicker({ id, label, value, onChange, excludeId, placeholder }: AgentSearchPickerProps) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);
    const matches = useApiResource<AgentSummary[]>(`agent-search:${q}`, () =>
        q.length >= 2 ? agentService.search(q) : Promise.resolve([])
    );

    if (value) {
        return (
            <div className="space-y-1.5">
                <Label>{label}</Label>
                <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <span className="truncate">
                        {agentLabel(value)}
                        {value.displayId ? (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">{value.displayId}</span>
                        ) : null}
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

    const rows = (matches.data ?? []).filter((row) => row.id !== excludeId);

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder ?? "Search agents by name or mobile"}
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
                        <p className="px-3 py-2 text-muted-foreground">No agent matches &ldquo;{q}&rdquo;.</p>
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
