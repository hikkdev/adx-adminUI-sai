"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { StatusBadge } from "@/components/adx/status-badge";
import { EngineShell } from "../engine-shell";
import { formatDate, formatINR } from "@/lib/format";
import {
    QUOTE_STATUS_META,
    priceModelService,
    type PriceDimension,
    type PricedQuote,
    type QuoteLineInput,
    type RateGrade,
    type SavedQuote,
} from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";

/**
 * Building a quote to hand to an advertiser.
 *
 * The case this exists for: somebody taking eleven spots across three cities
 * who wants something off the total. That conversation happens on the phone,
 * before anything is booked, and it needs a number the operator can defend.
 *
 * Pricing and saving are separate on purpose. Negotiation is iterative — move
 * the discount, see where it lands against the floors, move it back — and
 * writing a row for each attempt would fill the table with abandoned
 * arithmetic. Only the version that gets sent is worth keeping.
 */

const GRADES: RateGrade[] = ["PREMIUM", "A", "B", "C"];

type Line = QuoteLineInput & { key: string };

const blankLine = (): Line => ({
    key: Math.random().toString(36).slice(2),
    mediaTypeId: "",
    grade: "A",
    label: "",
    quantity: 1,
    days: 30,
    dimensionValueIds: [],
    areaSqFt: "",
});

export function QuotesView({
    quotes,
    mediaTypes,
    dimensions,
    onChanged,
}: {
    quotes: SavedQuote[];
    mediaTypes: MediaType[];
    dimensions: PriceDimension[];
    onChanged: () => void;
}) {
    const [lines, setLines] = React.useState<Line[]>([blankLine()]);
    const [sector, setSector] = React.useState("");
    const [discountPct, setDiscountPct] = React.useState("");
    const [notes, setNotes] = React.useState("");
    const [priced, setPriced] = React.useState<PricedQuote | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    /** Dimensions that pick their value by area rather than by hand are left out
     *  of the picker — the measurement chooses them. */
    const pickable = dimensions.filter((dimension) =>
        dimension.values.every((value) => !value.minAreaSqFt && !value.maxAreaSqFt)
    );

    const ready = lines.every((line) => line.mediaTypeId !== "");

    const body = () => ({
        sector: sector.trim() || null,
        discountPct: discountPct.trim() || null,
        notes: notes.trim() || null,
        lines: lines.map(({ key: _key, ...line }) => ({
            ...line,
            label: line.label?.trim() || null,
            areaSqFt: line.areaSqFt?.trim() || null,
        })),
    });

    async function price() {
        setBusy(true);
        setError(null);
        try {
            setPriced(await priceModelService.priceQuote(body()));
        } catch (cause) {
            setPriced(null);
            setError(cause instanceof Error ? cause.message : "Could not price that.");
        } finally {
            setBusy(false);
        }
    }

    async function save() {
        setBusy(true);
        try {
            const quote = await priceModelService.saveQuote(body());
            toast.success(`Quote ${quote.reference} saved`, {
                description: "Send it from the list below when you are ready.",
            });
            setPriced(null);
            setLines([blankLine()]);
            setDiscountPct("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save that quote.");
        } finally {
            setBusy(false);
        }
    }

    const set = (key: string, patch: Partial<Line>) =>
        setLines((current) =>
            current.map((line) => (line.key === key ? { ...line, ...patch } : line))
        );

    return (
        <EngineShell
            title="Quotes"
            subtitle="A price built by hand for an advertiser buying several spots, or negotiating."
            actions={
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        className="bg-card"
                        disabled={busy || !ready}
                        onClick={() => void price()}
                    >
                        Price it
                    </Button>
                    <Button disabled={busy || !priced} onClick={() => void save()}>
                        Save quote
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Advertiser sector</Label>
                            <Input
                                className="h-9"
                                value={sector}
                                onChange={(event) => setSector(event.target.value)}
                                placeholder="E-commerce"
                            />
                            <p className="text-xs text-muted-foreground">
                                Matched against the category rules.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Negotiated discount (%)</Label>
                            <Input
                                className="h-9 tabular-nums"
                                inputMode="decimal"
                                value={discountPct}
                                onChange={(event) => setDiscountPct(event.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Note</Label>
                            <Input
                                className="h-9"
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                placeholder="Agreed with Anjali, 4 Sep"
                            />
                        </div>
                    </div>
                </Card>

                <div className="space-y-3">
                    {lines.map((line, index) => (
                        <Card key={line.key} className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Line {index + 1}
                                </p>
                                {lines.length > 1 ? (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8"
                                        onClick={() =>
                                            setLines((current) =>
                                                current.filter((row) => row.key !== line.key)
                                            )
                                        }
                                    >
                                        <Trash2 className="size-4" />
                                        <span className="sr-only">Remove line</span>
                                    </Button>
                                ) : null}
                            </div>

                            <div className="mt-3 grid gap-3 lg:grid-cols-6">
                                <div className="space-y-1.5 lg:col-span-2">
                                    <Label>Media type</Label>
                                    <Combobox
                                        items={mediaTypes.map((mediaType) => ({
                                            label: mediaType.name,
                                            value: mediaType.id,
                                            description: mediaType.category,
                                        }))}
                                        value={line.mediaTypeId}
                                        onValueChange={(value) =>
                                            set(line.key, { mediaTypeId: value })
                                        }
                                        placeholder="Pick a media type"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Grade</Label>
                                    <Select
                                        value={line.grade}
                                        onValueChange={(value) =>
                                            set(line.key, { grade: value as RateGrade })
                                        }
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GRADES.map((grade) => (
                                                <SelectItem key={grade} value={grade}>
                                                    {grade}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Spots</Label>
                                    <Input
                                        className="h-9 tabular-nums"
                                        inputMode="numeric"
                                        value={String(line.quantity ?? 1)}
                                        onChange={(event) =>
                                            set(line.key, {
                                                quantity: Number(event.target.value) || 1,
                                            })
                                        }
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Days</Label>
                                    <Input
                                        className="h-9 tabular-nums"
                                        inputMode="numeric"
                                        value={String(line.days ?? 1)}
                                        onChange={(event) =>
                                            set(line.key, { days: Number(event.target.value) || 1 })
                                        }
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Area (sq ft)</Label>
                                    <Input
                                        className="h-9 tabular-nums"
                                        inputMode="decimal"
                                        value={line.areaSqFt ?? ""}
                                        onChange={(event) =>
                                            set(line.key, { areaSqFt: event.target.value })
                                        }
                                        placeholder="Picks a band"
                                    />
                                </div>
                            </div>

                            {pickable.length > 0 ? (
                                <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-3">
                                    {pickable.map((dimension) => {
                                        const chosen =
                                            dimension.values.find((value) =>
                                                (line.dimensionValueIds ?? []).includes(value.id)
                                            )?.id ?? "";
                                        return (
                                            <div key={dimension.id} className="space-y-1.5">
                                                <Label>{dimension.name}</Label>
                                                <Select
                                                    value={chosen}
                                                    onValueChange={(value) => {
                                                        // One value per dimension: drop any other
                                                        // value of this dimension before adding.
                                                        const others = (
                                                            line.dimensionValueIds ?? []
                                                        ).filter(
                                                            (id) =>
                                                                !dimension.values.some(
                                                                    (v) => v.id === id
                                                                )
                                                        );
                                                        set(line.key, {
                                                            dimensionValueIds: [...others, value],
                                                        });
                                                    }}
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue placeholder="Not set" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {dimension.values.map((value) => (
                                                            <SelectItem
                                                                key={value.id}
                                                                value={value.id}
                                                            >
                                                                {value.label} · {value.multiplier}x
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </Card>
                    ))}

                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => setLines((current) => [...current, blankLine()])}
                    >
                        <Plus className="mr-1.5 size-4" />
                        Add a spot
                    </Button>
                </div>

                {error ? (
                    <Card className="rounded-lg border-danger/40 bg-danger-soft p-5 shadow-none">
                        <p className="text-sm text-foreground">{error}</p>
                    </Card>
                ) : null}

                {priced ? (
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-base font-semibold text-foreground">The quote</h3>

                        {priced.needsLegalApproval.length > 0 ? (
                            <p className="mt-2 text-sm text-warning">
                                Needs sign-off before booking:{" "}
                                {priced.needsLegalApproval.join(", ")}
                            </p>
                        ) : null}

                        <div className="mt-4 space-y-4">
                            {priced.lines.map((line, index) => (
                                <div key={index} className="rounded-md border p-4">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <p className="font-medium text-foreground">
                                            {line.label ?? `Line ${index + 1}`}
                                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                                {line.quantity} × {line.days} days
                                            </span>
                                        </p>
                                        <p className="tabular-nums">
                                            <span className="font-medium">
                                                {formatINR(Number(line.ratePerDay))}
                                            </span>
                                            <span className="text-muted-foreground">/day</span>
                                        </p>
                                    </div>

                                    <table className="mt-3 w-full text-xs">
                                        <tbody>
                                            {line.steps.map((step, stepIndex) => (
                                                <tr key={stepIndex} className="border-b last:border-0">
                                                    <td className="py-1 pr-3 font-medium text-foreground">
                                                        {step.step}
                                                    </td>
                                                    <td className="py-1 pr-3 text-muted-foreground">
                                                        {step.rule}
                                                    </td>
                                                    <td className="py-1 pr-3 tabular-nums text-muted-foreground">
                                                        {step.factor}
                                                    </td>
                                                    <td className="py-1 text-right tabular-nums">
                                                        {formatINR(Number(step.running))}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <p className="mt-2 text-right text-sm tabular-nums text-muted-foreground">
                                        Line total {formatINR(Number(line.lineTotal))}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 space-y-1 border-t pt-4 text-sm tabular-nums">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Per day</span>
                                <span>{formatINR(Number(priced.subtotalPerDay))}</span>
                            </div>
                            {priced.discountPct ? (
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Less {priced.discountPct}%</span>
                                    <span>{formatINR(Number(priced.totalPerDay))} /day</span>
                                </div>
                            ) : null}
                            <div className="flex justify-between pt-1 text-base font-semibold text-foreground">
                                <span>Total</span>
                                <span>{formatINR(Number(priced.grandTotal))}</span>
                            </div>
                        </div>

                        {priced.belowFloor ? (
                            <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                                This lands below the rate-card floor once the discount is applied.
                                It can still be sent, and the listings on it will need a price
                                approval before they go live at these rates.
                            </p>
                        ) : null}
                    </Card>
                ) : null}

                <div>
                    <h3 className="text-base font-semibold text-foreground">Saved quotes</h3>
                    {quotes.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
                    ) : (
                        <div className="mt-3 overflow-x-auto rounded-lg border">
                            <table className="w-full min-w-[40rem] text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                        <th className="px-4 py-2.5">Reference</th>
                                        <th className="px-4 py-2.5">Sector</th>
                                        <th className="px-4 py-2.5">Discount</th>
                                        <th className="px-4 py-2.5">Total</th>
                                        <th className="px-4 py-2.5">Status</th>
                                        <th className="px-4 py-2.5">Raised</th>
                                        <th className="px-4 py-2.5" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {quotes.map((quote) => (
                                        <tr key={quote.id} className="border-b last:border-0">
                                            <td className="px-4 py-2.5 font-mono text-xs">
                                                {quote.reference}
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">
                                                {quote.sector ?? "—"}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                                                {quote.discountPct
                                                    ? `${(Number(quote.discountPct) * 100).toFixed(0)}%`
                                                    : "—"}
                                            </td>
                                            <td
                                                className={cn(
                                                    "px-4 py-2.5 font-medium tabular-nums",
                                                    quote.belowFloor && "text-warning"
                                                )}
                                            >
                                                {formatINR(Number(quote.grandTotal))}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <StatusBadge
                                                    status={QUOTE_STATUS_META[quote.status]}
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">
                                                {formatDate(quote.createdAt)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                {quote.status === "DRAFT" ? (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 bg-card"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void (async () => {
                                                                setBusy(true);
                                                                try {
                                                                    await priceModelService.setQuoteStatus(
                                                                        quote.id,
                                                                        "SENT"
                                                                    );
                                                                    toast.success(
                                                                        `${quote.reference} marked sent`
                                                                    );
                                                                    onChanged();
                                                                } finally {
                                                                    setBusy(false);
                                                                }
                                                            })()
                                                        }
                                                    >
                                                        Mark sent
                                                    </Button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </EngineShell>
    );
}
