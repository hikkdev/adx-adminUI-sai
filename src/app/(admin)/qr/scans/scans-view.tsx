"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { QR_TYPE_LABEL, SCAN_OUTCOMES, scanOutcomeMeta, type ScanByRow } from "@/services/qr";
import { displayNameOf, usersService, type UserRow, type WireUserDetail } from "@/services/users";
import { QrNav } from "../qr-nav";
import type { ScansFacets } from "./scans-loader";

/**
 * One person's scans (K-B1). The route takes a person, so the screen is a
 * picker first — `GET /users?q=` — and the log second: outcome chips and a
 * date window, both sent to the server, each row with the code it was a
 * scan of. The array is the route's own shape (newest first, 200 at most),
 * so there is no pager; the window is how a longer history is walked.
 */

interface ScansViewProps {
    /** Null while no person is chosen. */
    rows: ScanByRow[] | null;
    facets: ScansFacets;
    onFacetsChange: (next: ScansFacets) => void;
}

export function ScansView({ rows, facets, onFacetsChange }: ScansViewProps) {
    return (
        <div className="space-y-5">
            <QrNav />
            <PageHeader title="QR scans" subtitle="What one person has scanned, refusals included" />

            <PersonPicker
                scannedById={facets.scannedById}
                onPick={(id) => onFacetsChange({ ...facets, scannedById: id })}
                onClear={() => onFacetsChange({ scannedById: null, outcome: null, from: null, to: null })}
            />

            {facets.scannedById && (
                <>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="scans-from">From</Label>
                            <Input id="scans-from" type="date" value={facets.from ?? ""} onChange={(event) => onFacetsChange({ ...facets, from: event.target.value || null })} className="h-9 bg-card" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="scans-to">To</Label>
                            <Input id="scans-to" type="date" value={facets.to ?? ""} onChange={(event) => onFacetsChange({ ...facets, to: event.target.value || null })} className="h-9 bg-card" />
                        </div>
                        {(facets.from || facets.to) && (
                            <Button variant="ghost" size="sm" className="h-9" onClick={() => onFacetsChange({ ...facets, from: null, to: null })}>
                                Clear window
                            </Button>
                        )}
                    </div>

                    <FilterChips
                        chips={[
                            { value: "ALL", label: "All outcomes", ...(facets.outcome === null && rows ? { count: rows.length } : {}) },
                            ...SCAN_OUTCOMES.map((outcome) => ({
                                value: outcome,
                                label: scanOutcomeMeta(outcome).label,
                                ...(facets.outcome === outcome && rows ? { count: rows.length } : {}),
                            })),
                        ]}
                        value={facets.outcome ?? "ALL"}
                        onChange={(value) => onFacetsChange({ ...facets, outcome: value === "ALL" ? null : value })}
                    />

                    <Card className="overflow-hidden rounded-lg border-border shadow-none">
                        {!rows || rows.length === 0 ? (
                            <p className="px-5 py-12 text-center text-sm text-muted-foreground">No scans in this window.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-4 py-2.5 font-medium">When</th>
                                        <th className="px-4 py-2.5 font-medium">Code</th>
                                        <th className="px-4 py-2.5 font-medium">Acting as</th>
                                        <th className="px-4 py-2.5 font-medium">Action</th>
                                        <th className="px-4 py-2.5 font-medium">Distance</th>
                                        <th className="px-4 py-2.5 font-medium">Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((scan) => (
                                        <tr key={scan.id} className="border-b last:border-0 hover:bg-muted/30">
                                            <td className="px-4 py-3 text-muted-foreground">{formatDateTime(scan.createdAt)}</td>
                                            <td className="px-4 py-3">
                                                <Link href={`/qr?type=${scan.qr.type}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                    {QR_TYPE_LABEL[scan.qr.type] ?? scan.qr.type}
                                                </Link>
                                                <p className="font-mono text-xs text-muted-foreground">
                                                    {scan.qr.refId} · {scan.qr.id}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">{scan.role ? scan.role.replace(/_/g, " ").toLowerCase() : "—"}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{scan.action ?? "—"}</td>
                                            <td className="px-4 py-3 tabular-nums text-muted-foreground">{scan.distanceM !== null ? `${Math.round(scan.distanceM)} m` : "—"}</td>
                                            <td className="px-4 py-3">
                                                <StatusBadge status={scanOutcomeMeta(scan.outcome)} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {rows && rows.length >= 200 && (
                            <p className="border-t px-4 py-2 text-xs text-muted-foreground">The route answers the newest 200; narrow the window to see older scans.</p>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}

/** The person whose scans these are: chosen by search, or named from the URL's id. */
function PersonPicker({ scannedById, onPick, onClear }: { scannedById: string | null; onPick: (id: string) => void; onClear: () => void }) {
    const [query, setQuery] = React.useState("");
    const q = useDebounced(query.trim(), 350);

    const person = useApiResource<WireUserDetail | null>(`qr:scans-by:person:${scannedById ?? "none"}`, () =>
        scannedById ? usersService.get(scannedById).catch(() => null) : Promise.resolve(null),
    );
    const matches = useApiResource<UserRow[]>(`qr:scans-by:search:${scannedById ? "" : q}`, () =>
        !scannedById && q.length >= 2 ? usersService.list({ q }) : Promise.resolve([]),
    );

    if (scannedById) {
        const named = person.data;
        return (
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <span>
                        {named ? (
                            <Link href={`/users/${encodeURIComponent(named.id)}`} className="font-medium underline-offset-4 hover:underline">
                                {displayNameOf(named)}
                            </Link>
                        ) : (
                            <span className="font-mono text-xs">{scannedById}</span>
                        )}
                        {named && <span className="ml-2 text-xs text-muted-foreground">{named.mobile}</span>}
                    </span>
                    <button type="button" onClick={onClear} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Choose another person">
                        <X className="size-4" />
                    </button>
                </div>
            </div>
        );
    }

    const rows = matches.data ?? [];
    return (
        <div className="max-w-md space-y-1.5">
            <Label htmlFor="scans-person">Whose scans</Label>
            <Input id="scans-person" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people by name, email or mobile" className="h-9 bg-card" autoComplete="off" />
            {q.length >= 2 && (
                <div className="rounded-md border bg-card text-sm" role="listbox" aria-label="Matching people">
                    {matches.loading && rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Searching…</p>
                    ) : matches.error ? (
                        <p className="px-3 py-2 text-danger">{matches.error}</p>
                    ) : rows.length === 0 ? (
                        <p className="px-3 py-2 text-muted-foreground">Nobody matches &ldquo;{q}&rdquo;.</p>
                    ) : (
                        <ul className="max-h-48 divide-y overflow-y-auto">
                            {rows.slice(0, 10).map((row) => (
                                <li key={row.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        onClick={() => {
                                            onPick(row.id);
                                            setQuery("");
                                        }}
                                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                                    >
                                        <span className="truncate">{row.displayName}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{row.mobile}</span>
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
