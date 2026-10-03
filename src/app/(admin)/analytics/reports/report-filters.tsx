"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReportKind } from "@/services/reports";

/**
 * The filters a kind declares, drawn from the catalogue: a text box for a
 * string or an id, a select for an enum. Nothing else — a filter the kind
 * does not name would be refused by the server for the whole run.
 */
export function ReportFilters({
    kind,
    idPrefix,
    typed,
    onChange,
}: {
    kind: ReportKind | null;
    idPrefix: string;
    typed: Record<string, string>;
    onChange: (key: string, value: string) => void;
}) {
    if (!kind) return null;
    if (kind.filters.length === 0) {
        return <p className="text-xs text-muted-foreground">{kind.name} takes no filters — the window is the only cut.</p>;
    }
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {kind.filters.map((filter) => {
                const id = `${idPrefix}-${filter.key}`;
                const value = typed[filter.key] ?? "";
                if (filter.type === "enum") {
                    return (
                        <div key={filter.key} className="space-y-1">
                            <Label htmlFor={id} className="text-xs">
                                {filter.label}
                            </Label>
                            <Select value={value || "ANY"} onValueChange={(next) => onChange(filter.key, next === "ANY" ? "" : next)}>
                                <SelectTrigger id={id}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ANY">Any</SelectItem>
                                    {filter.values.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    );
                }
                return (
                    <div key={filter.key} className="space-y-1">
                        <Label htmlFor={id} className="text-xs">
                            {filter.label}
                        </Label>
                        <Input
                            id={id}
                            value={value}
                            onChange={(event) => onChange(filter.key, event.target.value)}
                            placeholder={filter.type === "id" ? "A record id" : "Any"}
                            className={filter.type === "id" ? "font-mono text-xs" : undefined}
                            maxLength={120}
                        />
                    </div>
                );
            })}
        </div>
    );
}
