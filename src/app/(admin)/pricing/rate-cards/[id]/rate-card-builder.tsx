"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    GRADES,
    GRADE_LABEL,
    RATE_CARD_STATE_META,
    publishDraft,
    rateCardService,
    type RateCard,
    type RateCardDraft,
    type RateCardImpact,
    type RateGrade,
} from "@/services/rate-cards";
import type { PriceModelSettings } from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";

interface RateCardBuilderProps {
    card: RateCard;
    mediaTypes: MediaType[];
    settings: PriceModelSettings;
    onChanged: () => void;
}

/**
 * The DR 10 rate-card builder: the base-rate grid, the card's settings, and the
 * publish bar.
 *
 * Two things differ from the fixture version this restores. Rates are per day,
 * because that is the unit every other part of the platform prices in — a card
 * quoting weekly beside listings quoting daily is how two rates get compared
 * wrongly. And a blank cell is editable rather than a label, because "not sold
 * at this grade" is a real answer that has to be settable, not just shown.
 *
 * Editing stops once a card is approved. The numbers on an ACTIVE card are what
 * listings were published against; saving from one creates the next version
 * instead, and publishing that supersedes this one.
 */

/** Only these two states take edits; the rest are history. */
const EDITABLE = new Set<RateCard["status"]>(["DRAFT", "PENDING_APPROVAL"]);

interface Row {
    mediaTypeId: string;
    name: string;
    /** Whole rupees as typed; "" is not sold. */
    cells: Record<RateGrade, string>;
}

const blankCells = (): Record<RateGrade, string> => ({ PREMIUM: "", A: "", B: "", C: "" });

function rowsFrom(card: RateCard, mediaTypes: MediaType[]): Row[] {
    const byId = new Map<string, Row>();
    for (const entry of card.entries ?? []) {
        const row = byId.get(entry.mediaTypeId) ?? {
            mediaTypeId: entry.mediaTypeId,
            name:
                entry.mediaTypeName ??
                mediaTypes.find((type) => type.id === entry.mediaTypeId)?.name ??
                "Unknown media type",
            cells: blankCells(),
        };
        row.cells[entry.grade] = entry.ratePerDay ? String(Math.round(Number(entry.ratePerDay))) : "";
        byId.set(entry.mediaTypeId, row);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function RateCardBuilder({ card, mediaTypes, settings, onChanged }: RateCardBuilderProps) {
    const router = useRouter();
    const [rows, setRows] = React.useState<Row[]>(() => rowsFrom(card, mediaTypes));
    const [rounding, setRounding] = React.useState(card.roundingRupees);
    const [graceDays, setGraceDays] = React.useState(card.graceDays ?? 14);
    const [floorPct, setFloorPct] = React.useState(Math.round(Number(card.floorPct) * 100));
    const [lastFloor, setLastFloor] = React.useState(
        Math.round(Number(card.floorPct) * 100) || 82
    );
    const [dirty, setDirty] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    /**
     * Lot E (Q97), reworked in E10-2: the approve dialog's Impact step is
     * measured through `POST /rate-cards/:id/impact/dry-run` over the grid
     * as typed — nothing is persisted and no revision is created until
     * Approve. The dialog holds the draft it measured, so what is approved
     * is exactly what was shown.
     */
    const [publishing, setPublishing] = React.useState<{ draft: RateCardDraft; impact: RateCardImpact } | null>(null);
    const [opening, setOpening] = React.useState(false);
    const [adding, setAdding] = React.useState("");

    /*
     * Re-derive the grid when the server sends a new card — after a save, an
     * approval, or a revision. Adjusted during render rather than in an effect,
     * so a frame of the old numbers is never painted first.
     */
    const [seen, setSeen] = React.useState(card);
    if (card !== seen) {
        setSeen(card);
        setRows(rowsFrom(card, mediaTypes));
        setRounding(card.roundingRupees);
        setGraceDays(card.graceDays ?? 14);
        setFloorPct(Math.round(Number(card.floorPct) * 100));
        setDirty(false);
    }

    const editable = EDITABLE.has(card.status);
    const active = card.status === "ACTIVE";
    const history = !editable && !active;
    const nextVersion = active ? card.version + 1 : card.version;
    const coverage = card.cityName ?? "All cities";

    const updateCell = (mediaTypeId: string, grade: RateGrade, raw: string) => {
        const digits = raw.replace(/[^\d]/g, "");
        setRows((current) =>
            current.map((row) =>
                row.mediaTypeId === mediaTypeId
                    ? { ...row, cells: { ...row.cells, [grade]: digits } }
                    : row
            )
        );
        setDirty(true);
    };

    const addRow = (mediaTypeId: string) => {
        const type = mediaTypes.find((candidate) => candidate.id === mediaTypeId);
        if (!type || rows.some((row) => row.mediaTypeId === mediaTypeId)) return;
        setRows((current) =>
            [...current, { mediaTypeId, name: type.name, cells: blankCells() }].sort((a, b) =>
                a.name.localeCompare(b.name)
            )
        );
        setAdding("");
        setDirty(true);
    };

    const entries = () =>
        rows.flatMap((row) =>
            GRADES.map((grade) => ({
                mediaTypeId: row.mediaTypeId,
                grade,
                ratePerDay: row.cells[grade] ? `${row.cells[grade]}.00` : null,
            }))
        );

    /** The grid and the settings as typed — what the dry-run measures and Approve persists. */
    const draftOf = (): RateCardDraft => ({
        entries: entries(),
        floorPct: (floorPct / 100).toFixed(4),
        graceDays,
        roundingRupees: rounding,
    });

    /** Writes the grid and the settings to a card that takes edits. */
    async function persist(target: RateCard) {
        const draft = draftOf();
        await rateCardService.update(target.id, {
            roundingRupees: draft.roundingRupees,
            floorPct: draft.floorPct,
            graceDays: draft.graceDays,
        });
        await rateCardService.setEntries(target.id, draft.entries);
    }

    async function saveDraft() {
        setBusy(true);
        try {
            if (editable) {
                await persist(card);
                setDirty(false);
                toast.success("Draft saved");
                onChanged();
            } else {
                // An approved card is not edited; its successor is.
                const draft = await rateCardService.revise(card.id);
                await persist(draft);
                toast.success(`Saved as draft v${draft.version}`, {
                    description: `v${card.version} stays live until the draft is published.`,
                });
                router.push(`/pricing/rate-cards/${draft.id}`);
            }
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the card.");
        } finally {
            setBusy(false);
        }
    }

    /**
     * Step one of publishing (E10-2): ask what the floor would do, measured
     * against the grid as typed through the dry-run. Nothing is written —
     * not the grid, not a revision of an ACTIVE card — so cancelling the
     * dialog leaves the server exactly as it was and the board still dirty.
     */
    async function openPublish() {
        setOpening(true);
        try {
            const draft = draftOf();
            const impact = await rateCardService.impactDryRun(card.id, draft);
            setPublishing({ draft, impact });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not read what this card would do.");
        } finally {
            setOpening(false);
        }
    }

    /** Nothing was persisted, so there is nothing to undo or open. */
    function cancelPublish() {
        setPublishing(null);
    }

    /**
     * Step two: the only moment the server is written. An ACTIVE card's
     * next version is created here, the measured draft is persisted to the
     * target, a DRAFT is submitted, and the approval raises the cases the
     * Impact step counted.
     */
    async function publish() {
        if (!publishing) return;
        const { draft, impact } = publishing;
        setBusy(true);
        try {
            const { target, approved } = await publishDraft(card, draft);
            setPublishing(null);
            setDirty(false);
            const raised = approved.impact?.raised ?? impact.affected;
            toast.success(`Version ${target.version} published`, {
                description:
                    raised > 0
                        ? `New bookings price against this version immediately. ${raised} price case${raised === 1 ? "" : "s"} raised for the listings under the new floor.`
                        : "New bookings price against this version immediately. No live listing sits under the new floor.",
            });
            if (target.id === card.id) onChanged();
            else router.push(`/pricing/rate-cards/${target.id}`);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not publish the card.");
            // A revision may already exist by now; the list shows it, and the draft here stays as typed.
            onChanged();
        } finally {
            setBusy(false);
        }
    }

    const available = mediaTypes
        .filter((type) => !type.mergedIntoId && !rows.some((row) => row.mediaTypeId === type.id))
        .map((type) => ({
            label: type.name,
            value: type.id,
            description: type.formatGroup ?? undefined,
        }));

    const settingsRows: {
        label: string;
        helper: string;
        control: React.ReactNode;
    }[] = [
        {
            label: "Base unit",
            helper: "What each cell is worth",
            control: <Value>Per day</Value>,
        },
        {
            label: "Minimum booking",
            helper: "From the pricing model's rate basis",
            control: <Value>{settings.minimumBookingDays} days</Value>,
        },
        { label: "Currency", helper: "All rates in rupees", control: <Value>INR</Value> },
        {
            label: "Rounding",
            helper: "Applied after multipliers",
            control: (
                <div className="relative w-28">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₹
                    </span>
                    <Input
                        type="number"
                        step="10"
                        min="0"
                        max="10000"
                        value={rounding}
                        disabled={history}
                        onChange={(event) => {
                            setRounding(Math.max(0, Number(event.target.value) || 0));
                            setDirty(true);
                        }}
                        className="h-9 pl-7 text-right tabular-nums"
                        aria-label="Round quotes to the nearest rupees"
                    />
                </div>
            ),
        },
        {
            label: "Floor price protection",
            helper: "Quotes below the floor need approval",
            control: (
                <Switch
                    checked={floorPct > 0}
                    disabled={history}
                    onCheckedChange={(checked) => {
                        if (!checked && floorPct > 0) setLastFloor(floorPct);
                        setFloorPct(checked ? lastFloor : 0);
                        setDirty(true);
                    }}
                    aria-label="Floor price protection"
                />
            ),
        },
        {
            label: "Floor",
            helper: "As a share of the card rate",
            control: (
                <div className="relative w-28">
                    <Input
                        type="number"
                        min="0"
                        max="100"
                        value={floorPct}
                        disabled={history || floorPct === 0}
                        onChange={(event) => {
                            setFloorPct(Math.min(100, Math.max(0, Number(event.target.value) || 0)));
                            setDirty(true);
                        }}
                        className="h-9 pr-7 text-right tabular-nums"
                        aria-label="Floor as a percentage of the card rate"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                    </span>
                </div>
            ),
        },
        {
            label: "Grace period",
            helper: "After a revision, days a live listing under the new floor has before a rejected case can unpublish it",
            control: (
                <div className="relative w-28">
                    <Input
                        type="number"
                        min="0"
                        max="90"
                        value={graceDays}
                        disabled={history}
                        onChange={(event) => {
                            setGraceDays(Math.min(90, Math.max(0, Number(event.target.value) || 0)));
                            setDirty(true);
                        }}
                        className="h-9 pr-12 text-right tabular-nums"
                        aria-label="Grace period in days"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        days
                    </span>
                </div>
            ),
        },
        { label: "Tax", helper: "GST is added on the invoice", control: <Value>Exclusive</Value> },
        {
            label: "Production",
            helper: "Printing and mounting",
            control: <Value>Billed separately</Value>,
        },
    ];

    return (
        <div className={cn("space-y-5", !history && "pb-24")}>
            <div>
                <Link
                    href="/pricing/model"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Pricing model
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {card.name}
                    </h1>
                    <StatusBadge status={RATE_CARD_STATE_META[card.status]} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    {coverage} · currently v{card.version}
                </p>
            </div>

            {history && (
                <Card className="rounded-lg border-border bg-muted/40 p-4 text-sm text-muted-foreground shadow-none">
                    This version is history. Listings were published against its numbers, so it
                    stays readable and cannot be edited.
                </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="border-b px-5 py-4">
                        <h2 className="text-base font-semibold text-foreground">Base daily rate</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Values in rupees per day, before illumination and size multipliers.
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-5 py-2.5">Media type</th>
                                    {GRADES.map((grade) => (
                                        <th key={grade} className="px-3 py-2.5 text-right">
                                            {GRADE_LABEL[grade]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={GRADES.length + 1}
                                            className="px-5 py-8 text-center text-sm text-muted-foreground"
                                        >
                                            No media types priced yet. Add one below to start the grid.
                                        </td>
                                    </tr>
                                )}
                                {rows.map((row) => (
                                    <tr key={row.mediaTypeId} className="border-b last:border-0">
                                        <td className="px-5 py-3 font-medium text-foreground">
                                            {row.name}
                                        </td>
                                        {GRADES.map((grade) => {
                                            const value = row.cells[grade];
                                            return (
                                                <td key={grade} className="px-3 py-2 text-right">
                                                    <Input
                                                        value={value ? formatINR(Number(value)) : ""}
                                                        placeholder="Not sold"
                                                        disabled={history}
                                                        inputMode="numeric"
                                                        onChange={(event) =>
                                                            updateCell(row.mediaTypeId, grade, event.target.value)
                                                        }
                                                        className="h-9 w-28 text-right tabular-nums placeholder:text-xs placeholder:text-muted-foreground/60"
                                                        aria-label={`${row.name} ${GRADE_LABEL[grade]} daily rate`}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
                        <p className="text-xs text-muted-foreground">
                            Blank cells mean the media type is not sold in that locality grade.
                        </p>
                        {!history && (
                            <div className="flex items-center gap-2">
                                <Combobox
                                    items={available}
                                    value={adding}
                                    onValueChange={setAdding}
                                    placeholder="Add a media type"
                                    searchPlaceholder="Search the catalogue…"
                                    className="w-64"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-9 bg-card"
                                    disabled={!adding}
                                    onClick={() => addRow(adding)}
                                >
                                    <Plus className="mr-1 size-3.5" />
                                    Add row
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>

                <Card className="h-fit rounded-lg border-border shadow-none">
                    <h2 className="border-b px-5 py-4 text-base font-semibold text-foreground">
                        Card settings
                    </h2>
                    <ul className="divide-y px-5">
                        {settingsRows.map((setting) => (
                            <li
                                key={setting.label}
                                className="flex items-center justify-between gap-4 py-3.5"
                            >
                                <div>
                                    <p className="text-sm font-medium text-foreground">{setting.label}</p>
                                    <p className="text-xs text-muted-foreground">{setting.helper}</p>
                                </div>
                                {setting.control}
                            </li>
                        ))}
                    </ul>
                    <p className="border-t px-5 py-3.5 text-xs text-muted-foreground">
                        {floorPct > 0
                            ? `Floor price is ${floorPct}% of card rate. Quotes below the floor need Finance approval.`
                            : "No floor on this card: any listing price passes the publish gate."}
                    </p>
                </Card>
            </div>

            {!history && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur md:left-[243px]">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                {active
                                    ? `Publishing creates version ${nextVersion}`
                                    : `Publishing activates version ${nextVersion}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Live bookings keep the price they were booked at.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                className="bg-card"
                                disabled={!dirty || busy}
                                onClick={() => void saveDraft()}
                            >
                                Save draft
                            </Button>
                            <Button disabled={busy || opening || rows.length === 0} onClick={() => void openPublish()}>
                                {opening ? "Measuring impact…" : `Publish version ${nextVersion}`}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={publishing !== null}
                onOpenChange={(open) => {
                    if (!open) cancelPublish();
                }}
                title={`Publish version ${nextVersion}?`}
                description={
                    active
                        ? `Approving writes the grid as v${nextVersion} and supersedes v${card.version}; from then on the new numbers gate publishing. Nothing is saved until you approve.`
                        : "Approving saves the grid and activates the card. From then on its numbers decide whether listings of these media types may publish, and the simulator traces from them. Nothing is saved until you approve."
                }
                confirmLabel={`Publish v${nextVersion}`}
                busy={busy}
                onConfirm={() => void publish()}
            >
                {publishing && <ImpactStep impact={publishing.impact} graceDays={publishing.draft.graceDays} />}
            </ConfirmDialog>
        </div>
    );
}

/**
 * Lot E (Q97): the Impact step. The ACTIVE listings this card leaves under
 * its floor, with how far under each sits — since E10-2 measured over the
 * grid as typed, before anything is persisted. Approving raises one
 * CARD_REVISION price case per row that has no live case already — the
 * publisher is told, and has the grace period to raise the rate before a
 * rejection can take the listing off the market.
 */
function ImpactStep({ impact, graceDays }: { impact: RateCardImpact; graceDays: number }) {
    if (impact.affected === 0) {
        return (
            <p className="rounded-md bg-success-soft px-3 py-2.5 text-sm text-success">
                No live listing sits under this card&rsquo;s floor. Approving raises no price case.
            </p>
        );
    }
    const fresh = impact.rows.filter((row) => !row.liveCase).length;
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
                {impact.affected} live listing{impact.affected === 1 ? " falls" : "s fall"} under the new floor — these become price cases.
            </p>
            <p className="text-xs text-muted-foreground">
                {fresh} new case{fresh === 1 ? "" : "s"} raised on approval
                {fresh < impact.affected ? `; ${impact.affected - fresh} already ${impact.affected - fresh === 1 ? "has" : "have"} one` : ""}.
                Each publisher is told and has {graceDays} day{graceDays === 1 ? "" : "s"} to raise the rate or ask ADX to keep it.
            </p>
            <div className="max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                            <th className="px-3 py-2">Listing</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Floor</th>
                            <th className="px-3 py-2 text-right">Shortfall</th>
                            <th className="px-3 py-2 text-right">Case</th>
                        </tr>
                    </thead>
                    <tbody>
                        {impact.rows.map((row) => (
                            <tr key={row.listingId} className="border-b last:border-0">
                                <td className="max-w-48 truncate px-3 py-2 font-medium text-foreground">{row.title}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.ratePerDay)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.floor)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatMoney(row.shortfall)}</td>
                                <td className="px-3 py-2 text-right text-muted-foreground">
                                    {row.liveCase ? `${row.liveCase.status.toLowerCase()} already` : "new"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Value({ children }: { children: React.ReactNode }) {
    return <span className="shrink-0 text-sm font-medium text-foreground">{children}</span>;
}
