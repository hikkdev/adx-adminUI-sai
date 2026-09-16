import { StatusBadge } from "@/components/adx/status-badge";
import { SCOPE_LABEL } from "@/services/suspension";
import type { SuspensionScope } from "@/types";

interface SuspendedChipProps {
    /** The row's `suspensionScopes`. Nothing is drawn while it is empty or absent. */
    scopes: SuspensionScope[] | undefined;
    className?: string;
}

/**
 * The small "Suspended" chip on a roster row — Lot A.
 *
 * Drawn only when the row carries a non-empty scope list, and named for what
 * it is rather than for the party's own status: a publisher whose wallet is
 * frozen is still KYC-verified, and an agent taken off new work is still on
 * the rota. The sections in force are on the chip's tooltip; the page has
 * the card.
 */
export function SuspendedChip({ scopes, className }: SuspendedChipProps) {
    if (!scopes?.length) return null;
    return (
        <span title={scopes.map((scope) => SCOPE_LABEL[scope] ?? scope).join(", ")} className={className}>
            <StatusBadge status={{ label: "Suspended", tone: "danger" }} />
        </span>
    );
}
