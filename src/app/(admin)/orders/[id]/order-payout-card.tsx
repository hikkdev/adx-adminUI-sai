"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeIndianRupee, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate, formatMoney, isZeroMoney } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    INCENTIVE_STATUS_META,
    financeReadsApi,
    financeService,
    type Incentive,
} from "@/services/finance";
import { settingsService, type InstallationCommissionMode } from "@/services/settings";
import type { Order } from "@/types";

type Loaded = {
    /** The INSTALLATION rows recorded against this order — one, by `recordIncentiveOnce`. */
    incentives: Incentive[];
    /** Null when the platform row could not be read. */
    mode: InstallationCommissionMode | null;
};

/**
 * What the installing agent is paid for this order (Lot B, Q102).
 *
 * Three figures, each from where it actually lives: the per-order fee ops
 * typed (`Order.agentFeeAmount`, read only on PER_ORDER), the quote the agent
 * accepted the job at (`quotedFee`, copied onto the offer so a later change
 * cannot re-price it), and the INSTALLATION incentive sign-off recorded —
 * `GET /finance/incentives?orderId=` — with its status. Crediting and
 * rejecting are the finance queue's own routes, so a decision made here is
 * the same decision made there.
 */
export function OrderPayoutCard({ order, onChanged }: { order: Order; onChanged?: () => void }) {
    const live = financeReadsApi();
    const [acting, setActing] = React.useState<{ row: Incentive; action: "credit" | "reject" } | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    const resource = useApiResource<Loaded>(`order:payout:${order.id}:${order.status}:${live}`, async () => {
        if (!live) return { incentives: [], mode: null };
        const [rows, platform] = await Promise.all([
            financeService.incentives({ orderId: order.id }),
            settingsService.get().catch(() => null),
        ]);
        return {
            incentives: rows.filter((row) => row.event === "INSTALLATION"),
            mode: platform?.installation.commissionMode ?? null,
        };
    });

    if (!live) return null;

    const incentive = resource.data?.incentives[0] ?? null;
    const mode = resource.data?.mode ?? null;

    async function confirm() {
        if (!acting) return;
        const { row, action } = acting;
        if (action === "reject" && !reason.trim()) return;
        setBusy(true);
        try {
            if (action === "credit") {
                await financeService.creditIncentive(row.id);
                toast.success(`${formatMoney(row.netAmount)} credited`, {
                    description: "It clears into the agent's wallet immediately.",
                });
            } else {
                await financeService.rejectIncentive(row.id, reason.trim());
                toast.success("Commission rejected", { description: "The agent is told why; nothing moves." });
            }
            setActing(null);
            setReason("");
            resource.reload();
            onChanged?.();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not record that decision.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="rounded-lg border-border p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Payout</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {mode === "PER_ORDER"
                            ? "Per-order mode: the fee ops typed is what the install pays; the flat rate stands in when none was typed."
                            : mode === "FLAT"
                              ? "Flat mode: the INSTALLATION rate at the agent's tier, quoted on the offer."
                              : "What the installing agent is paid, and where it stands."}
                    </p>
                </div>
                <Link href={`/finance/incentives`} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                    Incentives queue
                </Link>
            </div>

            <FieldList
                className="mt-4"
                items={[
                    [
                        "Agent fee typed",
                        order.agentFeeAmount ? (
                            <span className="tabular-nums">{formatMoney(order.agentFeeAmount)}</span>
                        ) : (
                            <span className="text-muted-foreground">None</span>
                        ),
                    ],
                    [
                        "Quoted on the offer",
                        order.quotedFee ? (
                            <span className="tabular-nums">{formatMoney(order.quotedFee)}</span>
                        ) : (
                            <span className="text-muted-foreground">No offer accepted yet</span>
                        ),
                    ],
                ]}
            />

            <div className="mt-4 border-t pt-4">
                {resource.error ? (
                    <p className="text-sm text-muted-foreground">{resource.error}</p>
                ) : incentive ? (
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-foreground">
                                    Installation commission · {formatMoney(incentive.amount)} gross
                                </p>
                                <StatusBadge status={INCENTIVE_STATUS_META[incentive.status]} />
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {isZeroMoney(incentive.taxWithheld)
                                    ? "No TDS at the rate in force"
                                    : `${formatMoney(incentive.taxWithheld)} TDS withheld`}{" "}
                                · {formatMoney(incentive.netAmount)} net · tier {incentive.tier} · recorded{" "}
                                {formatDate(incentive.createdAt)}
                                {incentive.verifiedAt ? ` · decided ${formatDate(incentive.verifiedAt)}` : ""}
                            </p>
                            {incentive.rejectionReason && (
                                <p className="mt-1 text-xs text-danger">{incentive.rejectionReason}</p>
                            )}
                        </div>
                        {incentive.status === "PENDING_VERIFICATION" && (
                            <div className="flex items-center gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="bg-card text-danger hover:text-danger"
                                    onClick={() => {
                                        setReason("");
                                        setActing({ row: incentive, action: "reject" });
                                    }}
                                >
                                    <X className="mr-1 size-3.5" />
                                    Reject
                                </Button>
                                <Button size="sm" onClick={() => setActing({ row: incentive, action: "credit" })}>
                                    <Check className="mr-1 size-3.5" />
                                    Credit
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex items-start gap-3">
                        <BadgeIndianRupee className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
                        <p className="text-sm text-muted-foreground">
                            {resource.loading
                                ? "Looking for the commission…"
                                : order.status === "COMPLETED"
                                  ? "No installation commission was recorded at sign-off — a self-install, or a record that failed and is logged for ops to record by hand."
                                  : "The installation commission is recorded when the install is signed off, then released by finance."}
                        </p>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={acting !== null}
                onOpenChange={(open) => !open && setActing(null)}
                title={acting?.action === "credit" ? "Credit this commission?" : "Reject this commission?"}
                description={
                    acting?.action === "credit"
                        ? `${formatMoney(acting?.row.netAmount)} moves into the agent's wallet now, net of tax. It is cleared money — an incentive has no clearing window.`
                        : "Nothing moves. The agent is told why, and the record stays as rejected rather than disappearing."
                }
                confirmLabel={acting?.action === "credit" ? "Credit the agent" : "Reject commission"}
                destructive={acting?.action === "reject"}
                busy={busy}
                disabled={acting?.action === "reject" && !reason.trim()}
                onConfirm={confirm}
            >
                {acting?.action === "reject" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="order-commission-reason">Reason</Label>
                        <Textarea
                            id="order-commission-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={3}
                            placeholder="What could not be verified. Shown to the agent."
                        />
                    </div>
                )}
            </ConfirmDialog>
        </Card>
    );
}
