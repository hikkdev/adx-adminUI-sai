"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { personDetail, personName, workService, type WorkPerson, type WorkPersonKind } from "@/services/work";

interface PeoplePickerProps {
    /** The user ids picked, in the order they were picked. */
    value: string[];
    onChange: (userIds: string[], people: WorkPerson[]) => void;
    /** Only one kind, when the picker is for a reviewer say. */
    kind?: WorkPersonKind;
    /** The people already known by id, so a chip is named before the search answers. */
    known?: WorkPerson[];
    placeholder?: string;
    id?: string;
    /** Drawn beside each picked person — the approver toggle. */
    renderPicked?: (person: WorkPerson) => React.ReactNode;
    /** Search the module's picker (`GET /work/people`) — swapped in tests. */
    search?: (q: string, kind?: WorkPersonKind) => Promise<WorkPerson[]>;
}

/**
 * The assignee picker over `GET /work/people?q&kind` — up to fifty active
 * employees and agents, both assignable (the people rule). Typing narrows
 * the list on the server; a click toggles; the picked ones sit above as
 * chips that name themselves even after the search moves on.
 */
export function PeoplePicker({ value, onChange, kind, known = [], placeholder = "Search staff and agents", id, renderPicked, search = (q, k) => workService.people(q, k) }: PeoplePickerProps) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query, 250);
    const results = useApiResource<WorkPerson[]>(`work:people:${kind ?? ""}:${q}`, () => search(q, kind).catch(() => [] as WorkPerson[]));
    /* Everyone ever picked here, so a chip stays named after the search moves on. */
    const [seen, setSeen] = React.useState<Map<string, WorkPerson>>(() => new Map());
    const names = React.useMemo(() => {
        const map = new Map<string, WorkPerson>();
        for (const person of [...known, ...seen.values(), ...(results.data ?? [])]) map.set(person.userId, person);
        return map;
    }, [known, seen, results.data]);

    const toggle = (person: WorkPerson) => {
        setSeen((current) => (current.has(person.userId) ? current : new Map(current).set(person.userId, person)));
        const next = value.includes(person.userId) ? value.filter((userId) => userId !== person.userId) : [...value, person.userId];
        onChange(next, next.map((userId) => names.get(userId) ?? (person.userId === userId ? person : null)).filter((p): p is WorkPerson => p !== null));
    };

    const picked = value.map((userId) => names.get(userId) ?? { userId, name: null, kind: null, role: null, departmentName: null });

    return (
        <div className="space-y-2">
            {picked.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                    {picked.map((person) => (
                        <li key={person.userId} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs">
                            <InitialsAvatar name={personName(person)} size="sm" className="size-5 text-[9px]" />
                            <span className="font-medium text-foreground">{personName(person)}</span>
                            {renderPicked?.(person)}
                            <button type="button" aria-label={`Remove ${personName(person)}`} onClick={() => toggle(person)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                                <X className="size-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id={id} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="pl-8" autoComplete="off" />
            </div>
            <ul className="grid max-h-60 gap-1 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="People">
                {results.loading && !results.data && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
                {results.data?.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">{q ? "Nobody matches." : "Nobody is on the registry yet."}</li>}
                {(results.data ?? []).map((person) => {
                    const checked = value.includes(person.userId);
                    return (
                        <li key={person.userId}>
                            <button
                                type="button"
                                onClick={() => toggle(person)}
                                aria-pressed={checked}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                                    checked ? "border-primary/40 bg-primary/5" : "bg-card hover:bg-muted/50",
                                )}
                            >
                                <InitialsAvatar name={personName(person)} size="sm" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground">{personName(person)}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{personDetail(person)}</span>
                                </span>
                                {checked && <Check className="size-4 shrink-0 text-primary" />}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
