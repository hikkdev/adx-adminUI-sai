import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Delta } from "@/services/overview";
import { figureDelta, moneyFigureDelta, type Figure, type MoneyFigure } from "@/services/section-overviews";

const deltaTone = { positive: "text-success", negative: "text-danger", neutral: "text-muted-foreground" } as const;
const deltaIcon = { positive: ArrowUpRight, negative: ArrowDownRight, neutral: Minus } as const;

export interface StatTileProps {
    label: string;
    /** The printed value. */
    value: string;
    /** The movement against the previous window; null for a state figure. */
    delta: Delta | null;
    /** The previous window's value as printed — the title on hover. */
    previous: string | null;
    /** A line under the figure: what it counts, or "as of now" for a state. */
    hint?: string;
    /** Where the tile leads, when the section has a page for it. */
    href?: string | null;
    className?: string;
}

/**
 * One tile of an overview: the label, the figure, and the movement against
 * the previous window as an arrow and a signed delta, with the previous
 * window's value on hover. A state figure — the KYC queue, who is
 * suspended now — has no previous on the platform, so the tile says "as of
 * now" rather than inventing a comparison.
 */
export function StatTile({ label, value, delta, previous, hint, href, className }: StatTileProps) {
    const Icon = delta ? deltaIcon[delta.tone] : null;
    const body = (
        <>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-metric mt-2 text-foreground">{value}</p>
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                {delta && Icon ? (
                    <span
                        className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", deltaTone[delta.tone])}
                        title={previous !== null ? `${previous} in the previous window` : undefined}
                        data-testid="stat-delta"
                    >
                        <Icon className="size-3.5" aria-hidden />
                        {delta.text}
                    </span>
                ) : null}
                {delta ? <span>vs previous</span> : <span>{hint ?? "as of now"}</span>}
                {delta && hint ? <span>· {hint}</span> : null}
            </p>
        </>
    );
    if (href) {
        return (
            <Card className={cn("rounded-lg border-border p-5 shadow-none transition-colors hover:border-foreground/30", className)}>
                <Link href={href} className="block">
                    {body}
                </Link>
            </Card>
        );
    }
    return <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>{body}</Card>;
}

/** A count tile from a `Figure` — the delta as the plain difference. */
export function CountTile({ label, figure, hint, href, className }: { label: string; figure: Figure; hint?: string; href?: string | null; className?: string }) {
    return (
        <StatTile
            label={label}
            value={formatNumber(figure.value)}
            delta={figureDelta(figure)}
            previous={figure.previous === null ? null : formatNumber(figure.previous)}
            hint={hint}
            href={href}
            className={className}
        />
    );
}

/** A money tile from a `MoneyFigure` — the delta as a share of the previous window. */
export function MoneyTile({ label, figure, hint, href, className }: { label: string; figure: MoneyFigure; hint?: string; href?: string | null; className?: string }) {
    return (
        <StatTile
            label={label}
            value={formatMoney(figure.value)}
            delta={moneyFigureDelta(figure)}
            previous={figure.previous === null ? null : formatMoney(figure.previous)}
            hint={hint}
            href={href}
            className={className}
        />
    );
}
