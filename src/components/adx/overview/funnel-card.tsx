import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

export interface FunnelStep {
    key: string;
    label: string;
    value: number;
}

export interface FunnelCardProps {
    title: string;
    hint?: string;
    steps: FunnelStep[];
    /** The full funnel tab, with the rows held at each gate. */
    href?: string;
    className?: string;
}

/**
 * The section's funnel as its module answers it — the platform's state
 * now, not the window's, and said so in the hint. Bars are proportional
 * to the first gate, so the drop-off between steps is what is read.
 */
export function FunnelCard({ title, hint, steps, href, className }: FunnelCardProps) {
    const widest = steps[0]?.value || 1;
    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
                    {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
                </div>
                {href ? (
                    <Link href={href} className="text-xs font-medium text-primary hover:underline">
                        Who is held where
                    </Link>
                ) : null}
            </div>
            <div className="mt-4 space-y-2.5">
                {steps.map((step, index) => {
                    const previous = index === 0 ? null : steps[index - 1]!.value;
                    const dropped = previous === null ? 0 : previous - step.value;
                    return (
                        <div key={step.key} className="flex items-center gap-3">
                            <span className="w-36 shrink-0 text-xs text-muted-foreground">{step.label}</span>
                            <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                                <div className="h-full rounded bg-primary/85" style={{ width: `${Math.max(2, (step.value / widest) * 100)}%` }} />
                            </div>
                            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{formatNumber(step.value)}</span>
                            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{dropped > 0 ? `−${formatNumber(dropped)} dropped` : ""}</span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
