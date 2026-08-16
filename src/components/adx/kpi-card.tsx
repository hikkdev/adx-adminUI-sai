import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { KpiStat } from "@/types";

const deltaToneClasses = {
    positive: "text-success",
    negative: "text-danger",
    neutral: "text-muted-foreground",
};

interface KpiCardProps {
    stat: KpiStat;
    className?: string;
}

/** Bento metric tile: label, condensed numeral, delta line. */
export function KpiCard({ stat, className }: KpiCardProps) {
    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="text-metric mt-2 text-foreground">{stat.value}</p>
            {(stat.delta || stat.hint) && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                    {stat.delta && (
                        <span className={cn("font-medium", deltaToneClasses[stat.deltaTone ?? "neutral"])}>
                            {stat.delta}
                        </span>
                    )}
                    {stat.delta && stat.hint && " "}
                    {stat.hint}
                </p>
            )}
        </Card>
    );
}
