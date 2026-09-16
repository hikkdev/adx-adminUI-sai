/** A KPI tile: label, the printed value, and the delta line under it. */
export interface KpiStat {
    id: string;
    label: string;
    value: string;
    delta?: string;
    deltaTone?: "positive" | "negative" | "neutral";
    hint?: string;
}
