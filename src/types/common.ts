/** Visual tone used by status badges and traffic-light indicators. */
export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusMeta {
    label: string;
    tone: Tone;
}

export interface Paged<T> {
    rows: T[];
    total: number;
}

export interface PageParams {
    page?: number;
    pageSize?: number;
    search?: string;
}
