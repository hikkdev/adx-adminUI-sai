"use client";

import * as React from "react";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { SimpleTable } from "@/components/adx/simple-table";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { LAYOUT_SURFACES, LAYOUT_SURFACE_LABEL, layoutsService, type LayoutSurface } from "@/services/layouts";
import { mediaService, type MediaSpec } from "@/services/media";
import { SLOT_KEY_PATTERN, pricingProblems, promotionsReadApi, promotionsService, withGst, type AdSlot } from "@/services/promotions";
import { AdsFrame } from "../ads-frame";
import { liveBlocks, placementsBySlot, type Placement } from "./placed-on";
import { PlacementsSection } from "./placements-section";

interface Loaded {
    slots: AdSlot[];
    specs: MediaSpec[];
}

/**
 * Every layout screen's live blocks, read to say where each slot is placed.
 * Its own resource: a desk that may not read layouts still gets its slots.
 */
async function loadPlacements(): Promise<Map<string, Placement[]>> {
    const summaries = await layoutsService.list();
    const screens = await Promise.all(
        summaries.map(async (summary) => {
            const detail = await layoutsService.get(summary.surface);
            return { surface: summary.surface, label: summary.label || LAYOUT_SURFACE_LABEL[summary.surface] || summary.surface, blocks: liveBlocks(detail) };
        }),
    );
    return placementsBySlot(screens);
}

/**
 * Slots & pricing — the two price lists ADX sells from. First the ad
 * slots: where on which screen, the artwork size, how many ads rotate
 * there on one day, the price a day before GST, the shortest booking, and
 * the screens whose live layout actually carries the slot. Then the two
 * sponsored-listing placements (a tab of their own until AS-1). A new rate
 * applies to bookings made after it; a booking keeps the rate it was quoted.
 */
export function SlotsView() {
    const live = promotionsReadApi();
    const { can } = useAuth();
    const mayEdit = can("growth.edit");
    const resource = useApiResource<Loaded | null>(`promotions:slots-desk:${live}`, async () => {
        if (!live) return null;
        const [slots, specs] = await Promise.all([promotionsService.slots(), mediaService.specs().catch(() => [] as MediaSpec[])]);
        return { slots, specs };
    });
    const placed = useApiResource<Map<string, Placement[]> | null>(`promotions:slots-placed:${live}`, () => (live ? loadPlacements() : Promise.resolve(null)));
    const [editing, setEditing] = React.useState<AdSlot | "new" | null>(null);
    const [toggling, setToggling] = React.useState<Record<string, boolean>>({});

    /* A link to `/ads/slots#KEY` (the layout builder's "Open slot") lands
       before the rows exist, so the browser neither scrolls to the row nor
       counts it as `:target`; do both once the rows are drawn. */
    const rowsReady = resource.data !== null;
    React.useEffect(() => {
        if (!rowsReady || !window.location.hash) return;
        const row = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        row?.setAttribute("data-target", "true");
        row?.scrollIntoView({ block: "center" });
    }, [rowsReady]);

    async function toggle(slot: AdSlot, isActive: boolean) {
        setToggling((current) => ({ ...current, [slot.id]: isActive }));
        try {
            await promotionsService.updateSlot(slot.id, { isActive });
            toast.success(isActive ? `${slot.label} is on sale` : `${slot.label} is off sale`, { description: isActive ? undefined : "Ads already booked keep running." });
            resource.reload();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setToggling(({ [slot.id]: _gone, ...rest }) => rest);
        }
    }

    return (
        <AdsFrame subtitle="What ADX sells and at what price: the display-ad slots, then the two places a sponsored listing can take. Flat rates a day, plus 18% GST.">
            <section className="space-y-3" aria-labelledby="ad-slots-heading">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 id="ad-slots-heading" className="text-base font-semibold text-foreground">
                            Ad slots
                        </h2>
                        <p className="text-sm text-muted-foreground">A slot shows only where a layout places it with an “Ad slot” block. Placed on reads each screen’s published layout.</p>
                    </div>
                    {mayEdit && (
                        <Button onClick={() => setEditing("new")} data-testid="slot-new">
                            <Plus className="mr-1 size-4" />
                            Add slot
                        </Button>
                    )}
                </div>
                <ResourceBoundary resource={resource}>
                    {(data) =>
                        !data ? null : data.slots.length === 0 ? (
                            <Card className="rounded-lg border-border shadow-none">
                                <EmptyState icon={Megaphone} title="No ad slots" description="Add a slot, then place it on a layout with an “Ad slot” block for its ads to show." />
                            </Card>
                        ) : (
                            <SimpleTable<AdSlot>
                                rows={data.slots}
                                rowKey={(row) => row.id}
                                rowId={(row) => row.key}
                                columns={[
                                    {
                                        key: "slot",
                                        label: "Slot",
                                        render: (row) => (
                                            <span>
                                                <span className="block text-sm font-medium text-foreground">{row.label}</span>
                                                <span className="block font-mono text-[11px] text-muted-foreground">{row.key}</span>
                                            </span>
                                        ),
                                    },
                                    { key: "surfaces", label: "May go on", render: (row) => <span className="text-xs text-muted-foreground">{row.surfaces.map((surface) => LAYOUT_SURFACE_LABEL[surface] ?? surface).join(", ")}</span> },
                                    { key: "placed", label: "Placed on", render: (row) => <PlacedOn slotKey={row.key} placed={placed.data} loading={placed.loading} error={placed.error} /> },
                                    {
                                        key: "spec",
                                        label: "Artwork",
                                        render: (row) => <span className="text-xs">{row.specDetail ? `${row.specDetail.label} · ${row.specDetail.width}×${row.specDetail.height}` : row.spec}</span>,
                                    },
                                    {
                                        key: "rate",
                                        label: "A day",
                                        className: "text-right",
                                        render: (row) => (
                                            <span className="tabular-nums">
                                                <span className="block text-sm">{formatMoney(row.ratePerDay)}</span>
                                                <span className="block text-[11px] text-muted-foreground">{withGst(row.ratePerDay) ? `${formatMoney(withGst(row.ratePerDay))} with GST` : ""}</span>
                                            </span>
                                        ),
                                    },
                                    { key: "max", label: "At once", className: "text-right", render: (row) => <span className="tabular-nums text-sm">{row.maxConcurrent}</span> },
                                    { key: "min", label: "Min. days", className: "text-right", render: (row) => <span className="tabular-nums text-sm">{row.minDays}</span> },
                                    {
                                        key: "active",
                                        label: "On sale",
                                        render: (row) => <Switch checked={toggling[row.id] ?? row.isActive} disabled={!mayEdit || row.id in toggling} onCheckedChange={(next) => void toggle(row, next)} aria-label={`${row.label} on sale`} />,
                                    },
                                    {
                                        key: "edit",
                                        label: "",
                                        className: "text-right",
                                        render: (row) =>
                                            mayEdit ? (
                                                <Button size="sm" variant="outline" className="h-7 bg-card" onClick={() => setEditing(row)}>
                                                    Edit
                                                </Button>
                                            ) : null,
                                    },
                                ]}
                            />
                        )
                    }
                </ResourceBoundary>
            </section>

            <section className="space-y-3" aria-labelledby="placements-heading">
                <div>
                    <h2 id="placements-heading" className="text-base font-semibold text-foreground">
                        Sponsored placements
                    </h2>
                    <p className="text-sm text-muted-foreground">Where a sponsored listing shows first, and what a day of it costs.</p>
                </div>
                <PlacementsSection />
            </section>

            <SlotDialog
                slot={editing === "new" ? null : editing}
                open={editing !== null}
                specs={resource.data?.specs ?? []}
                onOpenChange={(open) => !open && setEditing(null)}
                onSaved={() => {
                    setEditing(null);
                    resource.reload();
                }}
            />
        </AdsFrame>
    );
}

/** The screens a slot is placed on, each a link to its layout. */
function PlacedOn({ slotKey, placed, loading, error }: { slotKey: string; placed: Map<string, Placement[]> | null; loading: boolean; error: string | null }) {
    if (loading && !placed) return <span className="text-xs text-muted-foreground">Reading layouts…</span>;
    if (error || !placed) {
        return (
            <span className="text-xs text-muted-foreground" title={error ?? undefined}>
                Layouts could not be read
            </span>
        );
    }
    const screens = placed.get(slotKey) ?? [];
    if (screens.length === 0) return <span className="text-xs text-muted-foreground">Not placed on any screen yet</span>;
    return (
        <span className="flex flex-col gap-0.5" data-testid={`placed-on-${slotKey}`}>
            {screens.map((screen) => (
                <Link key={screen.surface} href={`/content/layouts/${screen.surface}`} className="text-xs text-info hover:underline">
                    {screen.label}
                </Link>
            ))}
        </span>
    );
}

interface SlotForm {
    key: string;
    label: string;
    description: string;
    surfaces: LayoutSurface[];
    spec: string;
    ratePerDay: string;
    maxConcurrent: string;
    minDays: string;
    isActive: boolean;
}

function SlotDialog({ slot, open, specs, onOpenChange, onSaved }: { slot: AdSlot | null; open: boolean; specs: MediaSpec[]; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">{open && <SlotFormBody slot={slot} specs={specs} onClose={() => onOpenChange(false)} onSaved={onSaved} />}</DialogContent>
        </Dialog>
    );
}

function SlotFormBody({ slot, specs, onClose, onSaved }: { slot: AdSlot | null; specs: MediaSpec[]; onClose: () => void; onSaved: () => void }) {
    const adSpecs = specs.filter((spec) => spec.key.startsWith("AD_"));
    const [values, setValues] = React.useState<SlotForm>(() => ({
        key: slot?.key ?? "",
        label: slot?.label ?? "",
        description: slot?.description ?? "",
        surfaces: slot?.surfaces ?? [],
        spec: slot?.spec ?? adSpecs[0]?.key ?? "",
        ratePerDay: slot?.ratePerDay ?? "",
        maxConcurrent: String(slot?.maxConcurrent ?? 3),
        minDays: String(slot?.minDays ?? 1),
        isActive: slot?.isActive ?? true,
    }));
    const [tried, setTried] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const set = <K extends keyof SlotForm>(key: K, value: SlotForm[K]) => setValues((current) => ({ ...current, [key]: value }));

    const problems: Partial<Record<keyof SlotForm, string>> = { ...pricingProblems(values) };
    if (!slot && !SLOT_KEY_PATTERN.test(values.key.trim())) problems.key = "Upper-case letters, digits and underscores — WEB_LISTING_SIDEBAR.";
    if (values.label.trim().length < 2) problems.label = "A name the desk and the buyer read.";
    if (values.surfaces.length === 0) problems.surfaces = "At least one screen.";
    if (!values.spec) problems.spec = "The artwork size.";
    const ready = Object.keys(problems).length === 0;
    const err = (key: keyof SlotForm) => (tried ? problems[key] : undefined);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setTried(true);
        if (!ready) return;
        setBusy(true);
        setError(null);
        const body = {
            label: values.label.trim(),
            description: values.description.trim() || null,
            surfaces: values.surfaces,
            spec: values.spec,
            ratePerDay: values.ratePerDay.trim(),
            maxConcurrent: Number(values.maxConcurrent),
            minDays: Number(values.minDays),
            isActive: values.isActive,
        };
        try {
            if (slot) await promotionsService.updateSlot(slot.id, body);
            else await promotionsService.createSlot({ ...body, key: values.key.trim() });
            toast.success(slot ? `${body.label} saved` : `${body.label} added`, { description: slot ? "New bookings take the new price." : "Place it on a layout with an “Ad slot” block." });
            onSaved();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{slot ? `Edit ${slot.label}` : "Add an ad slot"}</DialogTitle>
                <DialogDescription>A new price applies to bookings made after it; a booking keeps the price it was quoted.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Key — how layouts name it" error={err("key")}>
                    <Input value={values.key} onChange={(e) => set("key", e.target.value.toUpperCase())} disabled={!!slot} placeholder="WEB_LISTING_SIDEBAR" className="font-mono" />
                </FormField>
                <FormField label="Name" error={err("label")}>
                    <Input value={values.label} onChange={(e) => set("label", e.target.value)} placeholder="Listing page sidebar" maxLength={80} />
                </FormField>
            </div>
            <FormField label="Description — what the buyer is told" error={undefined}>
                <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={300} />
            </FormField>
            <FormField label="Screens it can appear on" error={err("surfaces")}>
                <div className="grid gap-2 sm:grid-cols-2">
                    {LAYOUT_SURFACES.map((surface) => (
                        <label key={surface} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={values.surfaces.includes(surface)}
                                onCheckedChange={(checked) => set("surfaces", checked ? [...values.surfaces, surface] : values.surfaces.filter((item) => item !== surface))}
                            />
                            {LAYOUT_SURFACE_LABEL[surface]}
                        </label>
                    ))}
                </div>
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Artwork size" error={err("spec")}>
                    <Select value={values.spec} onValueChange={(spec) => set("spec", spec)}>
                        <SelectTrigger aria-label="Artwork size">
                            <SelectValue placeholder="Pick a size" />
                        </SelectTrigger>
                        <SelectContent>
                            {(specs.length ? specs : []).map((spec) => (
                                <SelectItem key={spec.key} value={spec.key}>
                                    {spec.label} · {spec.width}×{spec.height}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FormField>
                <FormField label={withGst(values.ratePerDay) ? `Price a day (₹) — ₹${withGst(values.ratePerDay)} with GST` : "Price a day (₹), before GST"} error={err("ratePerDay")}>
                    <Input value={values.ratePerDay} onChange={(e) => set("ratePerDay", e.target.value)} inputMode="decimal" placeholder="1500" />
                </FormField>
                <FormField label="Ads at once — they rotate" error={err("maxConcurrent")}>
                    <Input value={values.maxConcurrent} onChange={(e) => set("maxConcurrent", e.target.value)} inputMode="numeric" />
                </FormField>
                <FormField label="Shortest booking (days)" error={err("minDays")}>
                    <Input value={values.minDays} onChange={(e) => set("minDays", e.target.value)} inputMode="numeric" />
                </FormField>
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">
                    <span className="block font-medium text-foreground">On sale</span>
                    <span className="block text-xs text-muted-foreground">Off, and buyers cannot book it; ads already booked keep running.</span>
                </span>
                <Switch checked={values.isActive} onCheckedChange={(next) => set("isActive", next)} aria-label="On sale" />
            </label>
            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button type="submit" disabled={busy} data-testid="slot-save">
                    {busy ? "Saving…" : slot ? "Save" : "Add slot"}
                </Button>
            </DialogFooter>
        </form>
    );
}

function FormField({ label, error, children }: { label: string; error: string | undefined; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            {children}
            {error && <p className="text-xs text-danger">{error}</p>}
        </div>
    );
}
