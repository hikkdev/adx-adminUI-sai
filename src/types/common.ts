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

/* ------------------------------------------------------------------ */
/* Suspension — Lot A                                                  */
/* ------------------------------------------------------------------ */

/**
 * Which section of a party is suspended. One vocabulary for listings,
 * publishers, advertisers and agents; which values a party admits is decided
 * by the backend's `suspension` module and mirrored in
 * `@/services/suspension`.
 */
export type SuspensionScope =
    | "BLOCK_NEW"
    | "STOP_OPEN_WORK"
    | "STOP_ACCRUAL"
    | "FREEZE_WALLET"
    | "BLOCK_SIGNIN";

/**
 * The three suspension columns every party read carries. They move as a set:
 * a non-empty scope list always has a reason and a date, an empty one never
 * does. Optional on the console's types only because the seeded fixtures
 * predate the columns; a row shaped from the wire always carries them.
 */
export interface SuspensionColumns {
    suspensionScopes?: SuspensionScope[];
    suspensionReason?: string | null;
    /** ISO timestamp of when the case started; kept through a partial lift. */
    suspendedAt?: string | null;
}
