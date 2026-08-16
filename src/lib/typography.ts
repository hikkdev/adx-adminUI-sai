/**
 * Shared typography classes (ADX Control Ledger).
 * Referenced by the base UI primitives so text styles stay consistent.
 */
export const typography = {
    "page-title": "text-2xl font-semibold tracking-tight text-foreground",
    "dialog-title": "text-lg font-semibold tracking-tight text-foreground",
    "section-title": "text-base font-semibold text-foreground",
    "section-description": "text-sm text-muted-foreground",
    "form-label": "text-sm font-medium text-foreground",
    "card-title": "text-base font-semibold text-foreground",
    "card-description": "text-sm text-muted-foreground",
    "button-base": "text-sm font-medium",
    "button-small": "text-xs font-medium",
    label: "text-xs font-medium uppercase tracking-wide text-muted-foreground",
} as const;

export type TypographyVariant = keyof typeof typography;
