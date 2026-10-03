"use client";

import * as React from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { countNoun, planBulk, planLine, runWithSummary, type BulkOutcome, type SkipRule } from "@/lib/bulk";
import { cn } from "@/lib/utils";

/**
 * One bulk action on a desk: a single-row route run over a selection
 * (`@/lib/bulk`). The desk says what the action is called, which rows it
 * skips and why, the permission it needs, and the call per row; this
 * component draws the button, the confirm dialog with the plan up front
 * ("3 will be published, 2 skipped (no draft)."), runs it, and toasts the
 * one-line summary with every failure named.
 */
export interface BulkAction<T> {
    key: string;
    /** The button — or the menu item, when `menu` is set: "Publish drafts". */
    label: string;
    icon?: LucideIcon;
    /** Actions sharing a menu name sit under one dropdown button ("Read on"). */
    menu?: string;
    /** The missing permission, said the way a single-row action says it; the button is disabled with this as its title. */
    blocked?: string | null;
    /** Why a row is left alone ("no draft"), or null when the action applies. */
    skip?: SkipRule<T>;
    /** "published" — the plan line and the summary. */
    participle: string;
    /** What one row is called in the count: ["draft", "drafts"]. */
    noun: readonly [string, string];
    /** The dialog's title and confirm label from the count ("3 drafts"): `(count) => \`Publish ${count}\``. */
    phrase: (count: string) => string;
    /** One sentence after the plan line. */
    description?: string;
    destructive?: boolean;
    /** Inputs inside the dialog — a change note, the switches to set. Their state stays with the desk. */
    body?: React.ReactNode;
    /** False while the body is incomplete. */
    ready?: boolean;
    /** Called as the dialog opens — the desk resets the body's state here. */
    onOpen?: () => void;
    /** The single-row call. */
    run: (row: T) => Promise<unknown>;
    /** Default three; one for a run that must go in order. */
    concurrency?: number;
    testId?: string;
}

interface BulkActionsProps<T> {
    rows: T[];
    actions: BulkAction<T>[];
    /** What a failure is called in the summary — a title, a path. */
    label: (row: T) => string;
    /** After the run and its toast: the desk keeps `outcome.failed` selected, clears the rest, and reloads once. */
    onSettled: (outcome: BulkOutcome<T>) => void;
}

export function BulkActions<T>({ rows, actions, label, onSettled }: BulkActionsProps<T>) {
    const [pendingKey, setPendingKey] = React.useState<string | null>(null);
    const [running, setRunning] = React.useState<string | null>(null);
    const pending = actions.find((action) => action.key === pendingKey) ?? null;
    const plan = pending ? planBulk(rows, pending.skip) : null;
    const count = plan ? countNoun(plan.apply.length, pending!.noun) : "";

    const open = (action: BulkAction<T>) => {
        action.onOpen?.();
        setPendingKey(action.key);
    };

    async function confirm() {
        if (!pending || !plan || plan.apply.length === 0) return;
        const action = pending;
        const apply = plan.apply;
        setRunning(action.key);
        setPendingKey(null);
        // Never throws: every row lands in done or failed, and the toast has gone out.
        const outcome = await runWithSummary({ rows: apply, action: action.run, participle: action.participle, label, concurrency: action.concurrency });
        setRunning(null);
        onSettled(outcome);
    }

    // A button per action, in the desk's order — except actions sharing a menu name, which sit under one dropdown where the first of them was listed.
    const items: ({ kind: "button"; action: BulkAction<T> } | { kind: "menu"; name: string; actions: BulkAction<T>[] })[] = [];
    for (const action of actions) {
        if (!action.menu) {
            items.push({ kind: "button", action });
            continue;
        }
        const menu = items.find((item) => item.kind === "menu" && item.name === action.menu);
        if (menu && menu.kind === "menu") menu.actions.push(action);
        else items.push({ kind: "menu", name: action.menu, actions: [action] });
    }

    return (
        <>
            {items.map((item) =>
                item.kind === "button" ? (
                    <Button
                        key={item.action.key}
                        variant="outline"
                        size="sm"
                        className={cn("h-8 bg-card", item.action.destructive && "text-danger hover:text-danger")}
                        disabled={running !== null || Boolean(item.action.blocked)}
                        title={item.action.blocked ?? undefined}
                        onClick={() => open(item.action)}
                        data-testid={item.action.testId ?? `bulk-${item.action.key}`}
                    >
                        {item.action.icon && <item.action.icon className="mr-1.5 size-3.5" />}
                        {running === item.action.key ? "Working…" : item.action.label}
                    </Button>
                ) : (
                    <DropdownMenu key={`menu-${item.name}`}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 bg-card" disabled={running !== null} data-testid={`bulk-menu-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                                {item.actions.some((action) => action.key === running) ? "Working…" : item.name}
                                <ChevronDown className="ml-1 size-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                            {item.actions.map((action) => (
                                // A disabled item cannot carry a tooltip, so the reason sits under the label.
                                <DropdownMenuItem key={action.key} disabled={Boolean(action.blocked)} title={action.blocked ?? undefined} onSelect={() => open(action)} data-testid={action.testId ?? `bulk-${action.key}`}>
                                    {action.icon && <action.icon className="mr-2 size-4" />}
                                    <span className="flex flex-col">
                                        <span>{action.label}</span>
                                        {action.blocked && <span className="text-[11px] text-muted-foreground">{action.blocked}</span>}
                                    </span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ),
            )}

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(next) => !next && setPendingKey(null)}
                title={pending ? `${pending.phrase(count)}?` : ""}
                description={pending && plan ? [planLine(plan, pending.participle), pending.description].filter(Boolean).join(" ") : ""}
                confirmLabel={pending ? pending.phrase(count) : "Confirm"}
                destructive={pending?.destructive}
                disabled={!plan || plan.apply.length === 0 || pending?.ready === false}
                onConfirm={() => void confirm()}
            >
                {pending?.body}
            </ConfirmDialog>
        </>
    );
}

/**
 * The bar a selection raises, for a desk that is not a `DataTable` (a rail,
 * a grid of cards) — the same look as the table's own bar.
 */
export function BulkBar({ count, total, onSelectAll, onClear, children }: { count: number; total?: number; onSelectAll?: () => void; onClear: () => void; children: React.ReactNode }) {
    if (count === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2.5" data-testid="bulk-bar">
            <span className="text-sm font-medium text-foreground">{count} selected</span>
            <div className="flex flex-wrap items-center gap-2">{children}</div>
            <div className="ml-auto flex items-center gap-1">
                {onSelectAll && total !== undefined && count < total && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={onSelectAll}>
                        Select all {total}
                    </Button>
                )}
                <Button variant="ghost" size="sm" className="h-8" onClick={onClear}>
                    Clear
                </Button>
            </div>
        </div>
    );
}

/**
 * A selection by id for a desk that draws its own rows. Ids that leave the
 * list (a reload after a filter change) drop out of `selected` on their own.
 */
export function useIdSelection<T>(rows: readonly T[], idOf: (row: T) => string) {
    const [ids, setIds] = React.useState<ReadonlySet<string>>(() => new Set());
    const selected = rows.filter((row) => ids.has(idOf(row)));
    return {
        selected,
        has: (row: T) => ids.has(idOf(row)),
        toggle: (row: T, on: boolean) =>
            setIds((current) => {
                const next = new Set(current);
                if (on) next.add(idOf(row));
                else next.delete(idOf(row));
                return next;
            }),
        selectAll: () => setIds(new Set(rows.map(idOf))),
        clear: () => setIds(new Set()),
        /** Keeps only these rows selected — the failures of a run. */
        keep: (keep: readonly T[]) => setIds(new Set(keep.map(idOf))),
    };
}
