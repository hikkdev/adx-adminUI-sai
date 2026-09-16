"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Info, OctagonAlert, TrendingDown, TrendingUp, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useApiResource } from "@/lib/use-api-resource";
import { insightChips, overviewReadsApi, overviewService, type DashboardInsights, type InsightChip, type InsightTone } from "@/services/overview";

const TONE_CLASSES: Record<InsightTone, string> = {
    info: "border-info/40 bg-info-soft text-foreground",
    warning: "border-warning/40 bg-warning-soft text-foreground",
    danger: "border-danger/40 bg-danger-soft text-foreground",
};

const TONE_ICON: Record<InsightTone, LucideIcon> = {
    info: Info,
    warning: AlertTriangle,
    danger: OctagonAlert,
};

const ICON_CLASSES: Record<InsightTone, string> = {
    info: "text-info",
    warning: "text-warning",
    danger: "text-danger",
};

/**
 * The frame's smart-insight strip above the tiles (`5102:23003`) — Lot G
 * (Q112): `GET /admin/overview/insights`, one chip per insight, coloured by
 * its severity, opening the route the rule names. Only a rule with
 * something to say appears, so the strip is hidden while the list is
 * empty — and while the read is loading or failed, because a strip that
 * said "could not load insights" would be an alarm about nothing.
 *
 * G13-B: the frame's dismiss cross posts `POST
 * /admin/overview/insights/:id/dismiss` and hides the chip for this
 * operator until the rule's value changes or seven days pass — the server
 * keeps the record, so the chip stays gone on the next screen too. A 404
 * (the rule has nothing to say any more) is treated as already gone.
 */
export function InsightsStrip() {
    const live = overviewReadsApi();
    const resource = useApiResource<DashboardInsights>(`dashboard:insights:${live}`, async () => {
        if (!live) return { generatedAt: "", items: [] };
        return overviewService.insights();
    });
    const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set());
    const [pending, setPending] = React.useState<string | null>(null);
    const chips = insightChips(resource.data?.items).filter((chip) => !dismissed.has(chip.id));
    if (chips.length === 0) return null;

    const dismiss = async (chip: InsightChip) => {
        setPending(chip.id);
        try {
            await overviewService.dismissInsight(chip.id);
            setDismissed((prev) => new Set(prev).add(chip.id));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) {
                // Nothing to dismiss any more: the row is already gone server-side.
                setDismissed((prev) => new Set(prev).add(chip.id));
            } else {
                toast.error(cause instanceof ApiError ? cause.message : "Could not dismiss the insight.");
            }
        } finally {
            setPending(null);
        }
    };

    return (
        <ul className="flex flex-wrap gap-2" aria-label="Insights">
            {chips.map((chip) => (
                <li key={chip.id}>
                    <InsightChipView
                        chip={chip}
                        direction={resource.data?.items.find((item) => item.key === chip.key)?.direction}
                        dismissing={pending === chip.id}
                        onDismiss={() => void dismiss(chip)}
                    />
                </li>
            ))}
        </ul>
    );
}

function InsightChipView({
    chip,
    direction,
    dismissing,
    onDismiss,
}: {
    chip: InsightChip;
    direction?: "UP" | "DOWN";
    dismissing: boolean;
    onDismiss: () => void;
}) {
    const Icon = direction === "UP" ? TrendingUp : direction === "DOWN" ? TrendingDown : TONE_ICON[chip.tone];
    const body = (
        <>
            <Icon className={cn("size-4 shrink-0", ICON_CLASSES[chip.tone])} aria-hidden />
            <span className="text-sm">{chip.text}</span>
        </>
    );
    const className = cn(
        "inline-flex items-center gap-2 rounded-l-md border border-r-0 px-3 py-2 transition-colors",
        TONE_CLASSES[chip.tone],
        chip.href && "hover:brightness-95"
    );
    return (
        <span className="inline-flex items-stretch">
            {chip.href ? (
                <Link href={chip.href} className={className}>
                    {body}
                </Link>
            ) : (
                <span className={className}>{body}</span>
            )}
            <button
                type="button"
                onClick={onDismiss}
                disabled={dismissing}
                aria-label={`Dismiss: ${chip.text}`}
                title="Dismiss for a week, or until it changes"
                className={cn(
                    "inline-flex items-center rounded-r-md border px-2 text-muted-foreground transition-colors hover:text-foreground hover:brightness-95 disabled:opacity-50",
                    TONE_CLASSES[chip.tone]
                )}
            >
                <X className="size-3.5" aria-hidden />
            </button>
        </span>
    );
}
