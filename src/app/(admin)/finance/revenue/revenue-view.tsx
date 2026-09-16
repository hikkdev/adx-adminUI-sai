"use client";

import * as React from "react";
import { Eye, EyeOff, Percent, Receipt } from "lucide-react";
import { toast } from "sonner";
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
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { DataTable } from "@/components/adx/data-table";
import { runBulk } from "@/lib/run-bulk";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { revenueService } from "@/services/revenue";
import type { MediaType } from "@/types/pricing-engine";
import {
    commissionRateSource,
    type CommissionRate,
    type FeeSchedule,
    type RevenueCategory,
    type TaxSettings,
} from "@/types/revenue";

interface Props {
    rates: CommissionRate[];
    fees: FeeSchedule[];
    tax: TaxSettings | null;
    /** The pricing engine's media types, for keying a rate. Empty when that read failed. */
    mediaTypes: MediaType[];
    onChanged: () => void;
}

const CATEGORIES: RevenueCategory[] = ["OUTDOOR", "TRANSIT", "INDOOR", "MEDIA"];

/** A fraction on the wire, a percentage on screen. Never the other way round. */
const asPercent = (rate: string) => `${(Number(rate) * 100).toFixed(2).replace(/\.00$/, "")}%`;

/** An amount as the wire wants it: digits, optionally two decimal places. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** "₹0.00 – ₹1,000.00 / day", "from ₹5,000.00 / day", or nothing for an unbanded row. */
function slabLabel(rate: Pick<CommissionRate, "minMediaValue" | "maxMediaValue">): string | null {
    if (rate.minMediaValue === null && rate.maxMediaValue === null) return null;
    if (rate.minMediaValue !== null && rate.maxMediaValue !== null) {
        return `${formatMoney(rate.minMediaValue)} – ${formatMoney(rate.maxMediaValue)} / day`;
    }
    if (rate.minMediaValue !== null) return `from ${formatMoney(rate.minMediaValue)} / day`;
    return `under ${formatMoney(rate.maxMediaValue)} / day`;
}

export function RevenueView({ rates, fees, tax, mediaTypes, onChanged }: Props) {
    const active = rates.filter((rate) => rate.isActive);
    const platformDefault = active.find((rate) => rate.category === null && rate.mediaTypeId === null);
    const mediaTypeName = React.useCallback(
        (id: string) => mediaTypes.find((type) => type.id === id)?.name ?? id,
        [mediaTypes]
    );

    return (
        <div className="space-y-6">
            <Card className="rounded-lg border-border bg-muted/30 p-4 shadow-none">
                <p className="text-sm text-foreground">
                    <strong>Commission comes out of the publisher&apos;s earnings.</strong> It is
                    never added to the advertiser&apos;s price — they see the publisher&apos;s own
                    rate, and ADX&apos;s take is invisible to them. Changing a rate here changes
                    what publishers are paid on future bookings, not what advertisers are charged.
                </p>
            </Card>

            <SectionCard
                title="Commission"
                description="Most specific wins: a promotional override, then a subscription, then a media-type rate for the spot's rental slab, then the media-type rate, then the category rate, then this default."
            >
                <SimpleTable
                    rows={active}
                    rowKey={(rate) => rate.id}
                    emptyMessage="No commission configured — a quote that finds no row refuses with COMMISSION_DEFAULT_MISSING rather than pricing the marketplace at a number nobody chose."
                    columns={[
                        {
                            key: "scope",
                            label: "Applies to",
                            render: (rate) => {
                                const slab = slabLabel(rate);
                                return (
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground">
                                            {rate.mediaTypeId
                                                ? mediaTypeName(rate.mediaTypeId)
                                                : (rate.category ?? "Everything (platform default)")}
                                        </p>
                                        {slab && <p className="text-xs text-muted-foreground">{slab}</p>}
                                    </div>
                                );
                            },
                        },
                        {
                            key: "source",
                            label: "Source key",
                            // The `commissionSource` the accrual and the quote
                            // stamp on a spot when this row wins — the same
                            // word the campaign page's spot table prints.
                            render: (rate) => (
                                <span className="font-mono text-xs text-muted-foreground">
                                    {commissionRateSource(rate)}
                                </span>
                            ),
                        },
                        {
                            key: "rate",
                            label: "ADX takes",
                            render: (rate) => (
                                <span className="tabular-nums text-foreground">
                                    {asPercent(rate.ratePct)}
                                </span>
                            ),
                        },
                        {
                            key: "note",
                            label: "Note",
                            render: (rate) => (
                                <span className="text-xs text-muted-foreground">
                                    {rate.note ?? "—"}
                                </span>
                            ),
                        },
                    ]}
                />
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    <strong>Used by the accrual.</strong> A resolved rate is stamped on every campaign
                    spot at authorisation and the daily accrual pays the publisher at that stamp — a row
                    changed here re-prices future bookings only. A spot authorised before the stamp
                    existed is resolved once by the accrual and recorded as{" "}
                    <span className="font-mono">RESOLVED_AT_ACCRUAL</span>. The source key on each row
                    is what appears beside the rate on a campaign&apos;s spot table.
                </p>
                <div className="mt-5">
                    <SetCommissionRate
                        currentDefault={platformDefault?.ratePct ?? null}
                        mediaTypes={mediaTypes}
                        onSaved={onChanged}
                    />
                </div>
            </SectionCard>

            <SectionCard
                title="Fees the advertiser pays"
                description="On top of the publisher's rate. Each carries its own GST, because printing and advertising are not taxed alike."
            >
                <DataTable
                    data={fees}
                    searchPlaceholder="Search fees…"
                    initialPageSize={10}
                    bulkActions={(rows, clear) => (
                        <>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    runBulk(
                                        rows.filter((row) => row.isActive),
                                        (row) =>
                                            revenueService.updateFee(row.id, { isActive: false }),
                                        "Retired",
                                        () => {
                                            clear();
                                            onChanged();
                                        }
                                    )
                                }
                            >
                                Retire selected
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    runBulk(
                                        rows.filter((row) => !row.isActive),
                                        (row) =>
                                            revenueService.updateFee(row.id, { isActive: true }),
                                        "Restored",
                                        () => {
                                            clear();
                                            onChanged();
                                        }
                                    )
                                }
                            >
                                Restore selected
                            </Button>
                        </>
                    )}
                    columns={[
                        {
                            accessorKey: "name",
                            header: "Fee",
                            cell: ({ row }) => (
                                <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">
                                        {row.original.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {row.original.perSpot ? "per spot" : "per booking"}
                                    </p>
                                </div>
                            ),
                        },
                        {
                            id: "amount",
                            header: "Amount",
                            accessorFn: (fee) =>
                                fee.percentPct !== null
                                    ? asPercent(fee.percentPct)
                                    : "Rs " + fee.flatAmount,
                        },
                        {
                            id: "gst",
                            header: "GST",
                            accessorFn: (fee) => asPercent(fee.gstPct),
                        },
                        {
                            id: "cart",
                            header: "In the cart",
                            cell: ({ row }) =>
                                row.original.amountShownInCart ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                                        <Eye className="size-3.5" aria-hidden />
                                        Named, with the amount
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <EyeOff className="size-3.5" aria-hidden />
                                        Named, amount at checkout
                                    </span>
                                ),
                        },
                        {
                            id: "state",
                            header: "",
                            cell: ({ row }) => (
                                <div className="flex items-center justify-end gap-2">
                                    {row.original.isActive ? (
                                        <StatusBadge status={{ label: "Live", tone: "success" }} />
                                    ) : (
                                        <StatusBadge status={{ label: "Retired", tone: "neutral" }} />
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async () => {
                                            try {
                                                await revenueService.updateFee(row.original.id, {
                                                    isActive: !row.original.isActive,
                                                });
                                                toast.success(
                                                    row.original.isActive
                                                        ? `Retired ${row.original.name}`
                                                        : `${row.original.name} is back`
                                                );
                                                onChanged();
                                            } catch (cause) {
                                                toast.error(
                                                    cause instanceof ApiError
                                                        ? cause.message
                                                        : "Could not change that fee"
                                                );
                                            }
                                        }}
                                    >
                                        {row.original.isActive ? "Retire" : "Restore"}
                                    </Button>
                                </div>
                            ),
                        },
                    ]}
                />
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    Every mandatory fee is <strong>named in the cart</strong> whether or not its
                    amount is. A cart implying the media rate is the price, with charges appearing
                    only at checkout, is the drip-pricing pattern the CCPA&apos;s 2023 dark-pattern
                    guidelines describe. Naming them costs the clean cart nothing.
                </p>
            </SectionCard>

            {/* Lot J2: `#tax` is where the Subscriptions card on /settings sends
                an operator — both subscription quotes read this one rate. */}
            <div id="tax" className="scroll-mt-24">
                <SectionCard
                    title="Tax on media"
                    description="GST on the advertising service itself, and on a subscription or a package. Fees carry their own rates above."
                >
                    <SetTax current={tax?.mediaGstPct ?? "0.18"} onSaved={onChanged} />
                </SectionCard>
            </div>
        </div>
    );
}

/**
 * Writing a rate. The scope picker offers the platform default, the four
 * categories and — Lot B — every media type the pricing engine knows, with
 * the optional rental slab under it. A slab needs a media type and a floor
 * below its ceiling; the API refuses anything else, and so does the button.
 */
function SetCommissionRate({
    currentDefault,
    mediaTypes,
    onSaved,
}: {
    currentDefault: string | null;
    mediaTypes: MediaType[];
    onSaved: () => void;
}) {
    /* One select over three kinds of key: "__default__", a category, or
       "media:<id>". Encoded rather than two controls, because exactly one
       of category and media type may be sent. */
    const [scope, setScope] = React.useState<string>("__default__");
    const [minValue, setMinValue] = React.useState("");
    const [maxValue, setMaxValue] = React.useState("");
    const [percent, setPercent] = React.useState(
        currentDefault ? (Number(currentDefault) * 100).toString() : ""
    );
    const [note, setNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const mediaTypeId = scope.startsWith("media:") ? scope.slice("media:".length) : null;
    const category = mediaTypeId === null && scope !== "__default__" ? (scope as RevenueCategory) : null;

    const value = Number(percent);
    const percentValid = percent.trim() !== "" && value >= 0 && value <= 100;
    const minText = minValue.trim();
    const maxText = maxValue.trim();
    const boundsTyped = minText !== "" || maxText !== "";
    const boundsValid =
        (minText === "" || AMOUNT.test(minText)) &&
        (maxText === "" || AMOUNT.test(maxText)) &&
        (minText === "" || maxText === "" || Number(minText) < Number(maxText));
    const valid = percentValid && boundsValid && (!boundsTyped || mediaTypeId !== null);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            // Typed as a percentage, sent as a fraction. The API rejects a whole
            // number outright, but converting here means nobody has to remember.
            await revenueService.setCommissionRate({
                category,
                mediaTypeId,
                minMediaValue: mediaTypeId && minText ? minText : null,
                maxMediaValue: mediaTypeId && maxText ? maxText : null,
                ratePct: (value / 100).toFixed(4),
                note: note.trim() || null,
            });
            toast.success("Commission updated", {
                description: "Future bookings only. Anything already priced keeps its rate.",
            });
            setNote("");
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that rate");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="w-56 space-y-2">
                <Label htmlFor="commission-scope">Applies to</Label>
                <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger id="commission-scope">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__default__">Everything (default)</SelectItem>
                        {CATEGORIES.map((option) => (
                            <SelectItem key={option} value={option}>
                                {option}
                            </SelectItem>
                        ))}
                        {mediaTypes
                            .filter((type) => type.status === "ACTIVE")
                            .map((type) => (
                                <SelectItem key={type.id} value={`media:${type.id}`}>
                                    {type.name}
                                    <span className="ml-1.5 text-xs text-muted-foreground">media type</span>
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
            </div>
            {mediaTypeId !== null && (
                <>
                    <div className="w-36 space-y-2">
                        <Label htmlFor="commission-min">Slab from (₹/day)</Label>
                        <Input
                            id="commission-min"
                            inputMode="decimal"
                            value={minValue}
                            onChange={(event) => setMinValue(event.target.value)}
                            placeholder="open"
                            className="tabular-nums"
                        />
                    </div>
                    <div className="w-36 space-y-2">
                        <Label htmlFor="commission-max">Slab to (₹/day)</Label>
                        <Input
                            id="commission-max"
                            inputMode="decimal"
                            value={maxValue}
                            onChange={(event) => setMaxValue(event.target.value)}
                            placeholder="open"
                            className="tabular-nums"
                            aria-invalid={boundsTyped && !boundsValid ? true : undefined}
                        />
                    </div>
                </>
            )}
            <div className="w-36 space-y-2">
                <Label htmlFor="commission-pct">ADX takes</Label>
                <div className="flex items-center gap-1.5">
                    <Input
                        id="commission-pct"
                        inputMode="decimal"
                        value={percent}
                        onChange={(event) => setPercent(event.target.value)}
                        placeholder="15"
                        className="tabular-nums"
                    />
                    <Percent className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
            </div>
            <div className="min-w-[14rem] flex-1 space-y-2">
                <Label htmlFor="commission-note">Note</Label>
                <Input
                    id="commission-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why this changed"
                />
            </div>
            <Button type="submit" disabled={busy || !valid}>
                {busy ? "Saving…" : "Set rate"}
            </Button>
            {mediaTypeId !== null && (
                <p className="basis-full text-xs text-muted-foreground">
                    The slab is on the per-day media value per unit the advertiser is billed for —
                    after the rate discount, before the campaign discount and the fees. The floor
                    is inclusive and the ceiling exclusive; leave either open. A banded row is
                    stamped as <span className="font-mono">MEDIA_TYPE_SLAB</span>, an unbanded one as{" "}
                    <span className="font-mono">MEDIA_TYPE</span>.
                </p>
            )}
        </form>
    );
}

function SetTax({ current, onSaved }: { current: string; onSaved: () => void }) {
    const [percent, setPercent] = React.useState((Number(current) * 100).toString());
    const [busy, setBusy] = React.useState(false);
    const value = Number(percent);
    const dirty = (value / 100).toFixed(4) !== Number(current).toFixed(4);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await revenueService.updateTax((value / 100).toFixed(4));
            toast.success("GST updated");
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save that rate");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="w-36 space-y-2">
                <Label htmlFor="media-gst">GST on media</Label>
                <div className="flex items-center gap-1.5">
                    <Input
                        id="media-gst"
                        inputMode="decimal"
                        value={percent}
                        onChange={(event) => setPercent(event.target.value)}
                        className="tabular-nums"
                    />
                    <Percent className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
            </div>
            <Button type="submit" disabled={busy || !dirty || value < 0 || value > 100}>
                <Receipt className="mr-1.5 size-3.5" aria-hidden />
                {busy ? "Saving…" : "Save"}
            </Button>
        </form>
    );
}
