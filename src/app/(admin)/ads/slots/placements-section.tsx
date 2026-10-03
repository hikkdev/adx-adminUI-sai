"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { BOOST_PLACEMENT_LABEL, BOOST_PLACEMENT_MEANING, pricingProblems, promotionsReadApi, promotionsService, withGst, type PlacementConfig } from "@/services/promotions";

/**
 * The two places a publisher can pay to put their listing first — the
 * second price list on Slots & pricing. Capacity is per day, per city and
 * category: that many sponsored listings share the top of one filtered
 * search at most.
 */
export function PlacementsSection() {
    const live = promotionsReadApi();
    const { can } = useAuth();
    const mayEdit = can("growth.edit");
    const resource = useApiResource<PlacementConfig[]>(`promotions:placements:${live}`, () => (live ? promotionsService.placements() : Promise.resolve([])));

    return (
        <ResourceBoundary resource={resource}>
            {(rows) =>
                rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">The server answered no placements.</p>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {rows.map((row) => (
                            <PlacementCard key={row.placement} row={row} mayEdit={mayEdit} onSaved={resource.reload} />
                        ))}
                    </div>
                )
            }
        </ResourceBoundary>
    );
}

function PlacementCard({ row, mayEdit, onSaved }: { row: PlacementConfig; mayEdit: boolean; onSaved: () => void }) {
    const initial = React.useMemo(
        () => ({ label: row.label, ratePerDay: row.ratePerDay, maxConcurrent: String(row.maxConcurrent), minDays: String(row.minDays), isActive: row.isActive }),
        [row],
    );
    const [values, setValues] = React.useState(initial);
    const [busy, setBusy] = React.useState(false);
    const problems = pricingProblems(values);
    const labelProblem = values.label.trim().length < 2 ? "A name the publisher reads." : undefined;
    const dirty = JSON.stringify(values) !== JSON.stringify(initial);
    const ready = dirty && Object.keys(problems).length === 0 && !labelProblem;
    const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((current) => ({ ...current, [key]: value }));

    async function save() {
        setBusy(true);
        try {
            await promotionsService.updatePlacement(row.placement, {
                label: values.label.trim(),
                ratePerDay: values.ratePerDay.trim(),
                maxConcurrent: Number(values.maxConcurrent),
                minDays: Number(values.minDays),
                isActive: values.isActive,
            });
            toast.success(`${values.label.trim()} saved`, { description: "New bookings take the new terms." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    const gst = withGst(values.ratePerDay);
    return (
        <Card className="space-y-4 rounded-lg border-border p-5 shadow-none" data-testid={`placement-${row.placement}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-mono text-[11px] text-muted-foreground">{row.placement}</p>
                    <h3 className="text-base font-semibold text-foreground">{BOOST_PLACEMENT_LABEL[row.placement] ?? row.placement}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{BOOST_PLACEMENT_MEANING[row.placement] ?? ""}</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    On sale
                    <Switch checked={values.isActive} disabled={!mayEdit} onCheckedChange={(next) => set("isActive", next)} aria-label={`${row.placement} on sale`} />
                </label>
            </div>
            <fieldset disabled={!mayEdit} className="grid gap-4 sm:grid-cols-2">
                <Field label="Name the publisher reads" error={labelProblem}>
                    <Input value={values.label} onChange={(e) => set("label", e.target.value)} maxLength={80} />
                </Field>
                <Field label={gst ? `Price a day (₹) — ₹${gst} with GST` : "Price a day (₹), before GST"} error={problems.ratePerDay}>
                    <Input value={values.ratePerDay} onChange={(e) => set("ratePerDay", e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="At once, per city and category" error={problems.maxConcurrent}>
                    <Input value={values.maxConcurrent} onChange={(e) => set("maxConcurrent", e.target.value)} inputMode="numeric" />
                </Field>
                <Field label="Shortest booking (days)" error={problems.minDays}>
                    <Input value={values.minDays} onChange={(e) => set("minDays", e.target.value)} inputMode="numeric" />
                </Field>
            </fieldset>
            {mayEdit && (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" className="bg-card" disabled={!dirty || busy} onClick={() => setValues(initial)}>
                        Reset
                    </Button>
                    <Button disabled={!ready || busy} onClick={() => void save()}>
                        {busy ? "Saving…" : "Save"}
                    </Button>
                </div>
            )}
        </Card>
    );
}

function Field({ label, error, children }: { label: string; error: string | undefined; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            {children}
            {error && <p className="text-xs text-danger">{error}</p>}
        </div>
    );
}
