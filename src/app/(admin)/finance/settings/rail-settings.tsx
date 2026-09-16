"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import { RAIL_LABEL, type PayoutRailName, type RailStatus } from "@/services/finance";
import {
    SETTING_BOUNDS,
    changedKeys,
    parseBounded,
    settingsService,
    type FinanceSettings,
    type PayoutRail,
} from "@/services/settings";

const RAILS: readonly PayoutRail[] = ["MANUAL_NEFT", "RAZORPAY_X", "CASHFREE"];

interface RailSettingsProps {
    /** Null when the platform row could not be read; the card says so. */
    finance: FinanceSettings | null;
    rails: RailStatus[];
    onChanged: () => void;
}

interface Draft {
    primaryRail: PayoutRail;
    railFallbackOrder: PayoutRail[];
    payoutEtaHours: string;
    clearingDays: string;
}

const toDraft = (finance: FinanceSettings): Draft => ({
    primaryRail: finance.primaryRail,
    railFallbackOrder: [...finance.railFallbackOrder],
    payoutEtaHours: String(finance.payoutEtaHours),
    clearingDays: String(finance.clearingDays),
});

/**
 * The `finance` keys of the platform settings row — Lot B (Q85).
 *
 * `railFor` reads them in order: a named preference if configured, then the
 * primary, then the fallback order, then manual — always last and always
 * available. So a primary rail nobody has credentials for is not an error;
 * it is a slower path, and the card says which it is rather than hiding it.
 *
 * Saved through the same deep patch the Settings page uses: only the leaves
 * that moved are sent, so an admin here and an admin on the KYC SLA in the
 * same minute do not overwrite each other.
 */
export function RailSettings({ finance, rails, onChanged }: RailSettingsProps) {
    if (!finance) {
        return (
            <SectionCard title="Payout rails" description="The rail a batch runs on, the order to fall back in, and the two windows a party is told about.">
                <p className="text-sm text-muted-foreground">
                    The platform settings row could not be read, so the rails cannot be edited here right now.
                </p>
            </SectionCard>
        );
    }
    return <RailForm key={JSON.stringify(finance)} finance={finance} rails={rails} onChanged={onChanged} />;
}

function RailForm({ finance, rails, onChanged }: RailSettingsProps & { finance: FinanceSettings }) {
    const [draft, setDraft] = React.useState<Draft>(() => toDraft(finance));
    const [busy, setBusy] = React.useState(false);

    const configured = (rail: PayoutRail) => rails.find((row) => row.name === rail)?.configured ?? false;

    const eta = parseBounded(draft.payoutEtaHours, SETTING_BOUNDS["finance.payoutEtaHours"]);
    const clearing = parseBounded(draft.clearingDays, SETTING_BOUNDS["finance.clearingDays"]);
    const valid = eta !== null && clearing !== null;

    /* The same diff the Settings page sends: only the leaves that moved, the
       fallback order compared by value and sent whole when it did. */
    const patch = (
        valid
            ? changedKeys(finance as unknown as Record<string, unknown>, {
                  primaryRail: draft.primaryRail,
                  railFallbackOrder: draft.railFallbackOrder,
                  payoutEtaHours: eta,
                  clearingDays: clearing,
              })
            : {}
    ) as Partial<FinanceSettings>;
    const dirty = Object.keys(patch).length > 0;

    const notInOrder = RAILS.filter((rail) => !draft.railFallbackOrder.includes(rail));

    function move(index: number, delta: -1 | 1) {
        setDraft((state) => {
            const order = [...state.railFallbackOrder];
            const target = index + delta;
            if (target < 0 || target >= order.length) return state;
            [order[index], order[target]] = [order[target]!, order[index]!];
            return { ...state, railFallbackOrder: order };
        });
    }

    async function save() {
        if (!valid || !dirty) return;
        setBusy(true);
        try {
            await settingsService.update({ finance: patch });
            toast.success("Payout rails saved", {
                description: `${RAIL_LABEL[draft.primaryRail as PayoutRailName]} first${
                    configured(draft.primaryRail) ? "" : " — not configured, so the fallback order applies"
                }. Batches created from now on read the new order; a batch already built keeps its rail.`,
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not save the rail settings.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Payout rails"
            description="The rail a batch runs on, the order to fall back in, and the two windows a party is told about. Manual NEFT is always available, whatever is listed."
            footer={
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        {valid
                            ? dirty
                                ? "Only the values that moved are sent."
                                : "Nothing has changed."
                            : "Hours are 1 to 336; clearing days 0 to 60."}
                    </p>
                    <Button size="sm" disabled={!valid || !dirty || busy} onClick={save}>
                        {busy ? "Saving…" : "Save rails"}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="rail-primary">Primary rail</Label>
                        <Select
                            value={draft.primaryRail}
                            onValueChange={(value) => setDraft((state) => ({ ...state, primaryRail: value as PayoutRail }))}
                        >
                            <SelectTrigger id="rail-primary">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RAILS.map((rail) => (
                                    <SelectItem key={rail} value={rail}>
                                        {RAIL_LABEL[rail as PayoutRailName]}
                                        {configured(rail) ? "" : " — not configured"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="rail-eta">Payout ETA (hours)</Label>
                        <Input
                            id="rail-eta"
                            inputMode="numeric"
                            value={draft.payoutEtaHours}
                            onChange={(event) => setDraft((state) => ({ ...state, payoutEtaHours: event.target.value }))}
                            aria-invalid={eta === null}
                        />
                        <p className="text-xs text-muted-foreground">What a party is told to expect after release.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="rail-clearing">Clearing days</Label>
                        <Input
                            id="rail-clearing"
                            inputMode="numeric"
                            value={draft.clearingDays}
                            onChange={(event) => setDraft((state) => ({ ...state, clearingDays: event.target.value }))}
                            aria-invalid={clearing === null}
                        />
                        <p className="text-xs text-muted-foreground">A daily earning's wait before it can be withdrawn.</p>
                    </div>
                </div>

                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Fallback order
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Walked when the primary rail has no credentials. Manual NEFT is tried last whether or not it
                        is listed.
                    </p>
                    <ol className="mt-2 divide-y rounded-lg border">
                        {draft.railFallbackOrder.map((rail, index) => (
                            <li key={rail} className="flex items-center gap-2 px-3 py-2 text-sm">
                                <span className="w-5 text-xs text-muted-foreground">{index + 1}.</span>
                                <span className="flex-1 font-medium text-foreground">
                                    {RAIL_LABEL[rail as PayoutRailName]}
                                    {configured(rail) ? "" : (
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                            not configured
                                        </span>
                                    )}
                                </span>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    disabled={index === 0}
                                    aria-label={`Move ${RAIL_LABEL[rail as PayoutRailName]} up`}
                                    onClick={() => move(index, -1)}
                                >
                                    <ArrowUp className="size-3.5" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    disabled={index === draft.railFallbackOrder.length - 1}
                                    aria-label={`Move ${RAIL_LABEL[rail as PayoutRailName]} down`}
                                    onClick={() => move(index, 1)}
                                >
                                    <ArrowDown className="size-3.5" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7"
                                    aria-label={`Remove ${RAIL_LABEL[rail as PayoutRailName]} from the order`}
                                    onClick={() =>
                                        setDraft((state) => ({
                                            ...state,
                                            railFallbackOrder: state.railFallbackOrder.filter((item) => item !== rail),
                                        }))
                                    }
                                >
                                    <X className="size-3.5" />
                                </Button>
                            </li>
                        ))}
                        {draft.railFallbackOrder.length === 0 && (
                            <li className="px-3 py-2 text-sm text-muted-foreground">
                                Nothing listed: an unconfigured primary falls straight to manual.
                            </li>
                        )}
                    </ol>
                    {notInOrder.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {notInOrder.map((rail) => (
                                <Button
                                    key={rail}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() =>
                                        setDraft((state) => ({
                                            ...state,
                                            railFallbackOrder: [...state.railFallbackOrder, rail],
                                        }))
                                    }
                                >
                                    + {RAIL_LABEL[rail as PayoutRailName]}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </SectionCard>
    );
}
