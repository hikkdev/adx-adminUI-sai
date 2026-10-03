import { StatusBadge } from "@/components/adx/status-badge";
import { ACCOUNT_STATE_META, isInactive, type AccountState } from "@/services/account-state";
import { SCOPE_LABEL } from "@/services/suspension";
import type { SuspensionScope } from "@/types";

interface AccountStatePillProps {
    /** The row's `accountState`. Nothing is drawn for a working account or a row that carries none. */
    state: AccountState | null | undefined;
    /** A suspended row's sections, named on the tooltip. */
    scopes?: SuspensionScope[];
    className?: string;
}

/**
 * The account-state pill on a queue or roster row — Suspended, Deactivated,
 * Closed or Left — beside the KYC pill, with the state's one line on the
 * tooltip. A working account draws nothing.
 */
export function AccountStatePill({ state, scopes, className }: AccountStatePillProps) {
    if (!isInactive(state)) return null;
    const meta = ACCOUNT_STATE_META[state];
    const title = state === "SUSPENDED" && scopes?.length ? `${meta.description} Stopped: ${scopes.map((scope) => SCOPE_LABEL[scope] ?? scope).join(", ")}.` : meta.description;
    return (
        <span title={title} className={className} data-testid="account-state-pill" data-state={state}>
            <StatusBadge status={meta} />
        </span>
    );
}
