"use client";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MixBar } from "@/components/adx/overview/mix-bar";
import {
    AUDIENCE_MIXES,
    AUDIENCE_MIX_GROUP,
    AUDIENCE_MIX_LABEL,
    AUDIENCE_VENDOR_LABEL,
    WEEKDAY_SHORT,
    agreementSentence,
    audienceSourceLabel,
    shareMixItems,
    type AudienceCatchment,
    type AudienceDemographics,
    type AudienceFootfall,
    type AudiencePeriod,
    type AudienceProvenanceByField,
    type AudienceSource,
    type AudienceVendor,
} from "@/services/audience";

/**
 * The audience figures, however they were reached — Y-C. A listing's
 * blended catchment and a city's folded profile carry the same four
 * things: a daily footfall with its hour and weekday profiles, the four
 * demographic mixes, who each group came from, and how far the two
 * vendors agreed. One drawing for both, so a figure reads the same on a
 * spot and on the city it stands in.
 *
 * Every figure is a PANEL figure — modelled by a vendor from a device
 * panel, never observed by ADX — and a null is printed as "not provided",
 * never as a number nobody measured.
 */

/** "GeoIQ" / "Azira" / "Both, blended" / "Not provided" as a small tag beside a section title. */
export function ProvenanceTag({ source, className }: { source: AudienceSource | null; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                source === null ? "border-dashed text-muted-foreground" : source === "BLENDED" ? "border-info/40 bg-info/10 text-info" : "bg-muted text-foreground",
                className,
            )}
            data-testid={`provenance-${source ?? "none"}`}
        >
            {audienceSourceLabel(source)}
        </span>
    );
}

/** A profile — 24 hours or 7 weekdays — as a strip of bars, the tallest at full height. */
export function ProfileStrip({ values, labels, title }: { values: number[]; labels: readonly string[]; title: string }) {
    const max = Math.max(...values, 0);
    return (
        <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="mt-1.5 flex h-12 items-end gap-px" role="img" aria-label={`${title}: ${values.map((value, index) => `${labels[index] ?? index} ${value}%`).join(", ")}`}>
                {values.map((value, index) => (
                    <div
                        key={labels[index] ?? index}
                        className="flex-1 rounded-t-sm bg-info/60"
                        style={{ height: `${max > 0 ? Math.max((value / max) * 100, 2) : 2}%` }}
                        title={`${labels[index] ?? index}: ${value}%`}
                    />
                ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{labels[0]}</span>
                <span>{labels[labels.length - 1]}</span>
            </div>
        </div>
    );
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);

export interface AudienceFiguresProps {
    footfall: AudienceFootfall;
    demographics: AudienceDemographics;
    provenanceByField: AudienceProvenanceByField;
    agreement: { footfall: number | null };
    /** What the daily figure is — "in the catchment" on a spot, "mean per catchment" on a city. */
    dailyHint: string;
}

/** The figures with their provenance and the agreement line. */
export function AudienceFigures({ footfall, demographics, provenanceByField, agreement, dailyHint }: AudienceFiguresProps) {
    const agree = agreementSentence(agreement.footfall);
    return (
        <div className="space-y-4">
            <section>
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Footfall</h4>
                    <ProvenanceTag source={provenanceByField.footfall} />
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{footfall.daily === null ? "—" : formatNumber(footfall.daily)}</p>
                <p className="text-xs text-muted-foreground">{footfall.daily === null ? "Daily footfall not provided" : `people a day, ${dailyHint}`}</p>
                {agree ? (
                    <p className="mt-1 text-xs text-info" data-testid="agreement">
                        {agree}
                    </p>
                ) : null}
                {footfall.byHour || footfall.byWeekday ? (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        {footfall.byHour ? <ProfileStrip values={footfall.byHour} labels={HOUR_LABELS} title="By hour" /> : null}
                        {footfall.byWeekday ? <ProfileStrip values={footfall.byWeekday} labels={WEEKDAY_SHORT} title="By weekday" /> : null}
                    </div>
                ) : null}
            </section>

            <section>
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Demographics</h4>
                    <ProvenanceTag source={provenanceByField.demographics} />
                    <span className="text-xs text-muted-foreground">· Affinities</span>
                    <ProvenanceTag source={provenanceByField.affinities} />
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {AUDIENCE_MIXES.map((mix) => {
                        const shares = demographics[mix];
                        const source = provenanceByField[AUDIENCE_MIX_GROUP[mix]];
                        return (
                            <MixBar
                                key={mix}
                                title={AUDIENCE_MIX_LABEL[mix]}
                                hint={shares ? audienceSourceLabel(source) : undefined}
                                items={shares ? shareMixItems(shares) : []}
                                sharesOnly
                                emptyMessage="Not provided."
                                className="p-4"
                            />
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

/** One vendor's own answer, compact — what the "By vendor" toggle reveals. */
export function RawVendorAnswer({ vendor, answer }: { vendor: AudienceVendor; answer: AudienceCatchment | undefined }) {
    if (!answer) {
        return (
            <div className="rounded-md border border-dashed p-3" data-testid={`raw-${vendor}`}>
                <p className="text-sm font-medium text-foreground">{AUDIENCE_VENDOR_LABEL[vendor]}</p>
                <p className="mt-1 text-xs text-muted-foreground">No stored answer for this month.</p>
            </div>
        );
    }
    const line = (label: string, shares: { label: string; share: number }[] | null) => (
        <div className="flex gap-2 text-xs">
            <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{shares ? shares.map((share) => `${share.label} ${share.share}%`).join(" · ") : "not provided"}</dd>
        </div>
    );
    return (
        <div className="rounded-md border p-3" data-testid={`raw-${vendor}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{AUDIENCE_VENDOR_LABEL[vendor]}</p>
                <p className="text-[11px] text-muted-foreground">
                    {answer.radiusM} m · {answer.period} · fetched {answer.fetchedAt.slice(0, 10)}
                </p>
            </div>
            <dl className="mt-2 space-y-1">
                <div className="flex gap-2 text-xs">
                    <dt className="w-16 shrink-0 text-muted-foreground">Daily</dt>
                    <dd className="tabular-nums text-foreground">{answer.footfall.daily === null ? "not provided" : formatNumber(answer.footfall.daily)}</dd>
                </div>
                <div className="flex gap-2 text-xs">
                    <dt className="w-16 shrink-0 text-muted-foreground">Profiles</dt>
                    <dd className="text-foreground">
                        {[answer.footfall.byHour ? "by hour" : null, answer.footfall.byWeekday ? "by weekday" : null].filter(Boolean).join(", ") || "not provided"}
                    </dd>
                </div>
                {line("Age", answer.demographics.ageBands)}
                {line("Gender", answer.demographics.gender)}
                {line("Income", answer.demographics.incomeBands)}
                {line("Affinities", answer.demographics.affinities)}
            </dl>
        </div>
    );
}

/** The month picker both cards carry — the last three months, this one first. */
export function AudiencePeriodSelect({ value, periods, onChange, label = "Month" }: { value: string; periods: AudiencePeriod[]; onChange: (period: string) => void; label?: string }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-[170px] bg-card text-xs" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {periods.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                        {period.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
