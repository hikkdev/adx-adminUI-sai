"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { supplyService, type RosterPublisher } from "@/services/supply";
import type { ImportPublisher } from "./party-import-config";

/** How many matches the picker shows — a short list; the directory is one click away. */
const LIMIT = 8;

interface PublisherPickerProps {
    id: string;
    value: ImportPublisher | null;
    onChange: (publisher: ImportPublisher | null) => void;
}

const toImportPublisher = (row: RosterPublisher): ImportPublisher => ({ id: row.id, name: row.name, displayId: row.displayId });

/**
 * The publisher a listings or rate-card file is for — package U.
 *
 * Found on the roster the way the command palette and the QR desk find
 * one: `GET /publishers?q=` over name, display id, city and mobile, one
 * page of eight. The same route answers an agent with the publishers
 * they may act for, so the list is already the right one for either
 * caller. Once picked, the publisher is a chip with a clear, and the id
 * that leaves here is one the API issued.
 */
export function PublisherPicker({ id, value, onChange }: PublisherPickerProps) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);
    const matches = useApiResource<RosterPublisher[]>(`import-publisher:${q}`, () => (q.length >= 2 ? supplyService.search(q, LIMIT) : Promise.resolve([])));

    if (value) {
        return (
            <div className="space-y-1.5">
                <Label>Publisher</Label>
                <div className="flex h-9 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <span className="truncate">
                        {value.name}
                        {value.displayId ? <span className="ml-2 font-mono text-xs text-muted-foreground">{value.displayId}</span> : null}
                    </span>
                    <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Change the publisher">
                        <X className="size-4" />
                    </button>
                </div>
            </div>
        );
    }

    const rows = matches.data ?? [];

    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>Publisher</Label>
            <Input id={id} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search publishers by name, id or mobile" className="h-9" autoComplete="off" />
            {q.length >= 2 && (
                <div className="rounded-md border text-sm" role="listbox" aria-label="Matching publishers">
                    {matches.loading && rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                    ) : matches.error ? (
                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">No publisher matches &ldquo;{q}&rdquo;.</p>
                    ) : (
                        <ul className="max-h-40 divide-y overflow-y-auto">
                            {rows.map((row) => (
                                <li key={row.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onClick={() => {
                                            onChange(toImportPublisher(row));
                                            setQuery("");
                                        }}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                                    >
                                        <span className="truncate">{row.name}</span>
                                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.displayId ?? row.city ?? row.mobile}</span>
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
