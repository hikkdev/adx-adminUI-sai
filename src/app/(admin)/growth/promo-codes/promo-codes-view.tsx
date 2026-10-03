"use client";

import * as React from "react";
import { Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable, type SimpleColumn } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { discountLabel, isLiveNow, promoCodesService, usageLabel, windowLabel, type PromoCode } from "@/services/promo-codes";
import { GrowthNav } from "../growth-nav";
import { PromoCodeDialog } from "./promo-code-dialog";
import { PROMO_SUBTITLE, PROMO_TITLE } from "./promo-codes-loader";

interface PromoCodesViewProps {
    codes: PromoCode[];
    /** Refetches after a write actually lands. */
    onChanged: () => void;
}

/**
 * PC-1 — the promo-code desk under Growth.
 *
 * The table reads the real contract: the code, what it takes off, the
 * minimum spend, the window, how many times it has been used against its
 * limits, and whether it is on. The Active switch PATCHes and is optimistic
 * about it — it moves at once and moves back if the server refuses. "New
 * code" and a row's "Edit" open the same dialog. Nothing is deleted here:
 * a code is switched off and keeps its redemptions.
 */
export function PromoCodesView({ codes, onChanged }: PromoCodesViewProps) {
    const [editing, setEditing] = React.useState<PromoCode | null | "new">(null);
    const [pending, setPending] = React.useState<Record<string, boolean>>({});

    const toggle = async (code: PromoCode, next: boolean) => {
        setPending((p) => ({ ...p, [code.id]: next }));
        try {
            await promoCodesService.update(code.id, { isActive: next });
            toast.success(next ? `${code.code} is on` : `${code.code} is off`, {
                description: next ? "Advertisers can type it on Review & pay from now." : "A campaign already paid with it keeps its discount.",
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The switch did not reach ADX.");
        } finally {
            setPending((p) => {
                const { [code.id]: _gone, ...rest } = p;
                return rest;
            });
        }
    };

    const columns: SimpleColumn<PromoCode>[] = [
        {
            key: "code",
            label: "Code",
            render: (row) => (
                <button type="button" onClick={() => setEditing(row)} className="text-left">
                    <span className="block font-mono text-sm font-semibold text-foreground">{row.code}</span>
                    {row.description && <span className="block text-xs text-muted-foreground">{row.description}</span>}
                </button>
            ),
        },
        { key: "discount", label: "Takes off", render: (row) => <span>{discountLabel(row)}</span> },
        {
            key: "minSpend",
            label: "Min. spend",
            className: "text-right",
            render: (row) => <span className="tabular-nums">{row.minSpend ? formatMoney(row.minSpend) : "—"}</span>,
        },
        { key: "window", label: "Window", render: (row) => <span className="text-sm">{windowLabel(row)}</span> },
        { key: "usage", label: "Used", render: (row) => <span className="tabular-nums text-sm">{usageLabel(row)}</span> },
        {
            key: "state",
            label: "State",
            render: (row) => (
                <StatusBadge
                    status={
                        !row.isActive
                            ? { label: "Off", tone: "neutral" }
                            : isLiveNow(row)
                              ? { label: "Live", tone: "success" }
                              : row.startsAt && new Date(row.startsAt) > new Date()
                                ? { label: "Scheduled", tone: "info" }
                                : { label: "Expired", tone: "warning" }
                    }
                />
            ),
        },
        {
            key: "active",
            label: "Active",
            className: "w-20",
            render: (row) => (
                <Switch
                    checked={pending[row.id] ?? row.isActive}
                    onCheckedChange={(next) => void toggle(row, next)}
                    disabled={row.id in pending}
                    aria-label={`${row.code} active`}
                />
            ),
        },
        {
            key: "actions",
            label: "",
            className: "w-24 text-right",
            render: (row) => (
                <Button size="sm" variant="outline" className="h-7 bg-card" onClick={() => setEditing(row)}>
                    Edit
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-5">
            <GrowthNav />
            <PageHeader
                title={PROMO_TITLE}
                subtitle={PROMO_SUBTITLE}
                actions={
                    <Button onClick={() => setEditing("new")}>
                        <Plus className="size-4" />
                        New code
                    </Button>
                }
            />
            {codes.length === 0 ? (
                <EmptyState
                    icon={Ticket}
                    title="No promo codes yet"
                    description="Make one and advertisers can type it on Review & pay. A code takes its cut off media and production, never off GST."
                    action={
                        <Button onClick={() => setEditing("new")}>
                            <Plus className="size-4" />
                            New code
                        </Button>
                    }
                />
            ) : (
                <SimpleTable columns={columns} rows={codes} rowKey={(row) => row.id} emptyMessage="No promo codes." />
            )}
            <p className="text-xs text-muted-foreground">
                {codes.length} {codes.length === 1 ? "code" : "codes"} · last change {codes[0] ? formatDate(codes[0].updatedAt) : "—"}
            </p>

            <PromoCodeDialog
                open={editing !== null}
                code={editing === "new" ? null : editing}
                onOpenChange={(open) => !open && setEditing(null)}
                onSaved={() => {
                    setEditing(null);
                    onChanged();
                }}
            />
        </div>
    );
}
