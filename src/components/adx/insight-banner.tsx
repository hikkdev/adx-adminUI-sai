"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightbulb, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SmartInsight } from "@/types";

interface InsightBannerProps {
    insight: SmartInsight;
    className?: string;
}

/**
 * "Smart Insight" strip pinned above the dashboard grid, surfaces one
 * AI-generated recommendation with a follow-up action.
 */
export function InsightBanner({ insight, className }: InsightBannerProps) {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    const isWarning = insight.severity === "warning";
    const Icon = isWarning ? TriangleAlert : Lightbulb;

    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3",
                isWarning
                    ? "border-warning/20 bg-warning-soft text-warning"
                    : "border-info/20 bg-info-soft text-info",
                className
            )}
        >
            <Icon className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 text-sm text-foreground">{insight.message}</p>
            <Link
                href={insight.action.href}
                className={cn("shrink-0 text-sm font-medium underline-offset-4 hover:underline")}
            >
                {insight.action.label}
            </Link>
            <button
                type="button"
                aria-label="Dismiss insight"
                onClick={() => setDismissed(true)}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
            >
                <X className="size-4" />
            </button>
        </div>
    );
}
