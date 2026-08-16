export interface KpiStat {
    id: string;
    label: string;
    value: string;
    delta?: string;
    deltaTone?: "positive" | "negative" | "neutral";
    hint?: string;
}

export interface MonthPoint {
    month: string;
    value: number;
}

export interface DayPoint {
    date: string;
    value: number;
}

export interface CategorySlice {
    category: string;
    value: number;
}

export interface TopPublisherRow {
    publisher: string;
    city: string;
    gmv: number;
    share: number;
}

export interface SmartInsight {
    id: string;
    severity: "info" | "warning";
    message: string;
    action: { label: string; href: string };
}
