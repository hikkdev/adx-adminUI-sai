import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Delta } from "@/services/overview";
import { figureDelta, moneyFigureDelta, type CostBlock, type Figure, type MoneyFigure } from "@/services/section-overviews";

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


/**
 * CP-2: what an onboarding cost.
 *
 * Three things this tile refuses to do, each for a reason.
 *
 * It does **not** show a movement against the previous window: the platform
 * computes no previous cost, and an arrow drawn from nothing would be a lie
 * the eye believes before the caption does.
 *
 * It does **not** print ₹0 when the figure is null. Null means nothing is
 * recorded — no salary against any agent here, or nothing onboarded at all —
 * and "₹0.00" says the opposite of that. The tile names which it is.
 *
 * And it divides by the agent-led onboardings only, saying so: an account
 * that signed itself up cost no agent anything, and burying it in the
 * denominator would quietly flatter the number every month.
 */
export function CostTile({
    label,
    cost,
    noun,
    href,
    className,
}: {
    label: string;
    cost: CostBlock;
    /** What was onboarded, singular — "publisher", "advertiser", "account". */
    noun: string;
    href?: string | null;
    className?: string;
}) {
    const { byAgent, selfServe } = cost.onboardings;
    const hint =
        cost.perOnboarding === null
            ? byAgent === 0
                ? `No ${noun} was onboarded by an agent in this window`
                : `${formatNumber(byAgent)} onboarded, but no agent here has a salary on record`
            : `${formatNumber(byAgent)} by agents${selfServe > 0 ? `, ${formatNumber(selfServe)} self-serve` : ""} · ${formatMoney(cost.allInPerOnboarding ?? cost.perOnboarding)} with commission`;
    return (
        <StatTile
            label={label}
            value={cost.perOnboarding === null ? "Not recorded" : formatMoney(cost.perOnboarding)}
            delta={null}
            previous={null}
            hint={hint}
            href={href}
            className={className}
        />
    );
}
