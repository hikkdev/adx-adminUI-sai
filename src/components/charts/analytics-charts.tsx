"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCompactINR, formatMoney, formatNumber } from "@/lib/format";
import { dayLongLabel, type DailySeriesPoint } from "@/services/overview";

const GRID = "hsl(240 5.9% 90%)";
const TICK = { fontSize: 11, fill: "hsl(240 3.8% 46.1%)" };
const ACCENT = "hsl(359.5 85.5% 29.8%)";
const INK = "hsl(240 10% 12%)";
const MUTED = "hsl(240 3.8% 46.1%)";
const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: `1px solid ${GRID}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};

/** The tooltip's heading: the bucket's day, and the previous window's day it is drawn against. */
function bucketHeading(point: DailySeriesPoint | undefined, fallback: unknown): string {
    if (!point) return String(fallback);
    return point.previousBucket ? `${dayLongLabel(point.bucket)} · vs ${dayLongLabel(point.previousBucket)}` : dayLongLabel(point.bucket);
}

/** Every `n`th tick, so a ninety-day axis does not print ninety labels. */
function tickInterval(points: number): number {
    if (points <= 10) return 0;
    return Math.ceil(points / 8) - 1;
}

/**
 * The analytics page's "Daily GMV" card (`5102:25931`): the frame's solid
 * curve is this window's recognised GMV per bucket, the dotted one the
 * previous window's bucket at the same position — `GET /admin/overview/series`.
 *
 * The `gmv` and `previousGmv` numbers only place the marks; the tooltip
 * prints the decimal strings the API sent, so a figure read off the chart is
 * the figure on the tile.
 */
export function DailyGmvChart({ data }: { data: DailySeriesPoint[] }) {
    return (
        <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                <defs>
                    <linearGradient id="daily-gmv-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} interval={tickInterval(data.length)} />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(value: number) => formatCompactINR(value)}
                    tick={TICK}
                />
                <Tooltip
                    formatter={(value, name, item) => {
                        const point = item.payload as DailySeriesPoint | undefined;
                        if (name === "previousGmv") return [formatMoney(point?.previousGmvRecognised), "Previous"];
                        return [formatMoney(point?.gmvRecognised ?? String(value)), "This period"];
                    }}
                    labelFormatter={(label, payload) => bucketHeading(payload?.[0]?.payload as DailySeriesPoint | undefined, label)}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Line
                    type="monotone"
                    dataKey="previousGmv"
                    stroke={MUTED}
                    strokeWidth={1.25}
                    strokeDasharray="3 4"
                    dot={false}
                    activeDot={{ r: 2.5 }}
                    connectNulls={false}
                />
                <Area
                    type="monotone"
                    dataKey="gmv"
                    stroke={ACCENT}
                    strokeWidth={1.75}
                    fill="url(#daily-gmv-fill)"
                    dot={false}
                    activeDot={{ r: 3 }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

/** The three money series the owner asked for as their own cards. */
export type MoneyMetric = "earnings" | "spend" | "commissions";

const MONEY_METRIC: Record<
    MoneyMetric,
    { key: keyof DailySeriesPoint; previousKey: keyof DailySeriesPoint; label: string; text: (p: DailySeriesPoint) => string; previousText: (p: DailySeriesPoint) => string | null }
> = {
    earnings: {
        key: "earnings",
        previousKey: "previousEarnings",
        label: "Earnings",
        text: (p) => formatMoney(p.publisherEarnings),
        previousText: (p) => (p.previousPublisherEarnings === null ? null : formatMoney(p.previousPublisherEarnings)),
    },
    spend: {
        key: "spend",
        previousKey: "previousSpend",
        label: "Spend",
        text: (p) => formatMoney(p.advertiserSpend),
        previousText: (p) => (p.previousAdvertiserSpend === null ? null : formatMoney(p.previousAdvertiserSpend)),
    },
    commissions: {
        key: "commissions",
        previousKey: "previousCommissions",
        label: "Commissions",
        text: (p) => formatMoney(p.agentCommissions),
        previousText: (p) => (p.previousAgentCommissions === null ? null : formatMoney(p.previousAgentCommissions)),
    },
};

/**
 * One money series per card — publishers' earnings, advertisers' spend,
 * agents' commissions — drawn the way the GMV card is: this window solid,
 * the previous window dotted, the tooltip printing the strings the API sent.
 */
export function MoneySeriesChart({ data, metric }: { data: DailySeriesPoint[]; metric: MoneyMetric }) {
    const spec = MONEY_METRIC[metric];
    const gradient = `money-series-${metric}`;
    return (
        <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                    <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={INK} stopOpacity={0.1} />
                        <stop offset="100%" stopColor={INK} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} interval={tickInterval(data.length)} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => formatCompactINR(value)} tick={TICK} />
                <Tooltip
                    formatter={(value, name, item) => {
                        const point = item.payload as DailySeriesPoint | undefined;
                        if (name === spec.previousKey) return [point ? (spec.previousText(point) ?? "—") : String(value), "Previous"];
                        return [point ? spec.text(point) : String(value), spec.label];
                    }}
                    labelFormatter={(label, payload) => bucketHeading(payload?.[0]?.payload as DailySeriesPoint | undefined, label)}
                    contentStyle={TOOLTIP_STYLE}
                />
                <Line
                    type="monotone"
                    dataKey={spec.previousKey}
                    stroke={MUTED}
                    strokeWidth={1.25}
                    strokeDasharray="3 4"
                    dot={false}
                    activeDot={{ r: 2.5 }}
                    connectNulls={false}
                />
                <Area type="monotone" dataKey={spec.key} stroke={INK} strokeWidth={1.75} fill={`url(#${gradient})`} dot={false} activeDot={{ r: 3 }} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

/** Which of the three onboarding counts the card draws — the segment narrows it. */
export type OnboardingLine = "publishersOnboarded" | "advertisersOnboarded" | "agentsActivated";

const ONBOARDING_LINE: Record<OnboardingLine, { label: string; stroke: string }> = {
    publishersOnboarded: { label: "Publishers", stroke: ACCENT },
    advertisersOnboarded: { label: "Advertisers", stroke: INK },
    agentsActivated: { label: "Agents", stroke: MUTED },
};

/**
 * The onboarding card: publishers and advertisers activated, agents
 * verified by the desk — one line each, per bucket. Counts, so the tooltip
 * prints the number the bucket carries.
 */
export function OnboardingChart({ data, lines }: { data: DailySeriesPoint[]; lines: OnboardingLine[] }) {
    return (
        <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} dy={6} interval={tickInterval(data.length)} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tick={TICK} />
                <Tooltip
                    formatter={(value, name) => [formatNumber(Number(value)), ONBOARDING_LINE[name as OnboardingLine]?.label ?? String(name)]}
                    labelFormatter={(label, payload) => {
                        const point = payload?.[0]?.payload as DailySeriesPoint | undefined;
                        return point ? dayLongLabel(point.bucket) : String(label);
                    }}
                    contentStyle={TOOLTIP_STYLE}
                />
                {lines.map((line) => (
                    <Line
                        key={line}
                        type="monotone"
                        dataKey={line}
                        stroke={ONBOARDING_LINE[line].stroke}
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
}

export const ONBOARDING_LINE_LABEL: Record<OnboardingLine, string> = {
    publishersOnboarded: ONBOARDING_LINE.publishersOnboarded.label,
    advertisersOnboarded: ONBOARDING_LINE.advertisersOnboarded.label,
    agentsActivated: ONBOARDING_LINE.agentsActivated.label,
};
