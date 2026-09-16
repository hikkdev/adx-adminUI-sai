import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { MixItem } from "@/services/section-overviews";

const segmentTone = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    neutral: "bg-muted-foreground/40",
} as const;

export interface MixBarProps {
    title: string;
    hint?: string;
    items: MixItem[];
    /** What an empty mix says. */
    emptyMessage?: string;
    /** Y-C: the items are shares already (an audience mix, 0–100), so the legend prints the share alone rather than a count and its share. */
    sharesOnly?: boolean;
    className?: string;
}

/**
 * A by-state mix — the KYC queue, a login's roles, an agent's tier — as
 * one stacked bar with a legend row per segment: the count, its share,
 * and, where the section has a page that filters on the state, a link
 * (the KYC queue with the state chip preselected). Segments with nothing
 * in them are listed but take no width.
 */
export function MixBar({ title, hint, items, emptyMessage = "Nothing to split yet.", sharesOnly = false, className }: MixBarProps) {
    const total = items.reduce((sum, item) => sum + item.count, 0);
    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
            {total === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
                <>
                    <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${title}: ${items.map((item) => `${item.label} ${item.count}${sharesOnly ? "%" : ""}`).join(", ")}`}>
                        {items
                            .filter((item) => item.count > 0)
                            .map((item) => (
                                <div key={item.key} className={cn("h-full", segmentTone[item.tone])} style={{ width: `${(item.count / total) * 100}%` }} title={`${item.label}: ${formatNumber(item.count)}`} />
                            ))}
                    </div>
                    <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                        {items.map((item) => {
                            const share = total > 0 ? Math.round((item.count / total) * 1000) / 10 : 0;
                            const label = (
                                <span className="flex items-center gap-2 text-sm">
                                    <span className={cn("inline-block size-2 shrink-0 rounded-full", segmentTone[item.tone])} aria-hidden />
                                    <span className="text-foreground">{item.label}</span>
                                </span>
                            );
                            return (
                                <li key={item.key} className="flex items-center justify-between gap-3">
                                    {item.href ? (
                                        <Link href={item.href} className="underline-offset-4 hover:underline">
                                            {label}
                                        </Link>
                                    ) : (
                                        label
                                    )}
                                    <span className="text-sm tabular-nums text-muted-foreground">
                                        {sharesOnly ? (
                                            `${share}%`
                                        ) : (
                                            <>
                                                {formatNumber(item.count)}
                                                <span className="ml-1.5 text-xs">({share}%)</span>
                                            </>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Card>
    );
}
