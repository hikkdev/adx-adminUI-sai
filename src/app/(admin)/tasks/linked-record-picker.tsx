"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { LINKED_KINDS, LINKED_KIND_LABEL, searchLinked, type LinkedCandidate, type WorkLinkedKind } from "@/services/work";

interface LinkedRecordPickerProps {
    kind: WorkLinkedKind | "";
    id: string;
    /** The picked record's label, when the task already carries one. */
    label?: string | null;
    onChange: (next: { kind: WorkLinkedKind | ""; id: string; label: string | null }) => void;
    /** The search over the section's list — swapped in tests. */
    search?: (kind: WorkLinkedKind, q: string) => Promise<LinkedCandidate[]>;
}

const NONE = "__none__";

/**
 * What a task is about, when it is about a record: a kind, then a search
 * over that section's own list service (`searchLinked`). The pair goes on
 * the wire together; the server checks the row exists and answers 404
 * naming it otherwise.
 */
export function LinkedRecordPicker({ kind, id, label, onChange, search = searchLinked }: LinkedRecordPickerProps) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query, 300);
    const results = useApiResource<LinkedCandidate[]>(`work:linked:${kind}:${q}`, () => (kind ? search(kind, q).catch(() => [] as LinkedCandidate[]) : Promise.resolve([])));
    const picked = id ? (results.data?.find((row) => row.id === id) ?? { id, label: label ?? id }) : null;

    return (
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="grid gap-1.5">
                <Label htmlFor="linked-kind">About a record</Label>
                <Select value={kind || NONE} onValueChange={(value) => onChange({ kind: value === NONE ? "" : (value as WorkLinkedKind), id: "", label: null })}>
                    <SelectTrigger id="linked-kind">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>Nothing in particular</SelectItem>
                        {LINKED_KINDS.map((option) => (
                            <SelectItem key={option} value={option}>
                                {LINKED_KIND_LABEL[option]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {kind && (
                <div className="grid gap-1.5">
                    <Label htmlFor="linked-search">{LINKED_KIND_LABEL[kind]}</Label>
                    {picked ? (
                        <div className="flex h-10 items-center justify-between gap-2 rounded-md border bg-card px-3 text-sm">
                            <span className="truncate font-medium text-foreground">{picked.label}</span>
                            <button type="button" aria-label="Clear the linked record" onClick={() => onChange({ kind, id: "", label: null })} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                                <X className="size-3.5" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input id="linked-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${LINKED_KIND_LABEL[kind].toLowerCase()}s`} className="pl-8" autoComplete="off" />
                            </div>
                            <ul className="max-h-48 overflow-y-auto rounded-md border" aria-label="Matches">
                                {results.loading && !results.data && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
                                {results.data?.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">{q || kind !== "ADVERTISER" ? "Nothing matches." : "Type to search."}</li>}
                                {(results.data ?? []).map((row) => (
                                    <li key={row.id}>
                                        <button
                                            type="button"
                                            onClick={() => onChange({ kind, id: row.id, label: row.label })}
                                            className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50", row.id === id && "bg-primary/5")}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium text-foreground">{row.label}</span>
                                                {row.description && <span className="block truncate text-xs text-muted-foreground">{row.description}</span>}
                                            </span>
                                            {row.id === id && <Check className="size-4 shrink-0 text-primary" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
