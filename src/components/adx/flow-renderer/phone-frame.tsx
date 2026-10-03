"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** The DR 09 frame width the apps are drawn at. */
export const PHONE_WIDTH = 390;

interface PhoneFrameProps {
    children: React.ReactNode;
    /** Pinned under the scrolling body, the way the apps' `Screen` pins its footer. */
    footer?: React.ReactNode;
    className?: string;
    /** The line printed above the frame — which screen this is. */
    caption?: string;
}

/**
 * FL-2 (27 Sep 2026): a 390-pixel phone, drawn on the web, for the board's
 * preview. The body scrolls inside a fixed height so a long screen behaves
 * as it does on a phone rather than pushing the board down the page.
 */
export function PhoneFrame({ children, footer, className, caption }: PhoneFrameProps) {
    return (
        <div className={cn("mx-auto", className)} style={{ width: PHONE_WIDTH }} data-testid="phone-frame">
            {caption && <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">{caption}</p>}
            <div className="flex h-[720px] flex-col overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-background shadow-lg">
                <div className="flex h-8 shrink-0 items-center justify-between px-6 text-[11px] font-medium text-foreground">
                    <span>9:41</span>
                    <span className="h-4 w-20 rounded-full bg-foreground/85" aria-hidden />
                    <span>●●●</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">{children}</div>
                {footer && <div className="shrink-0 border-t bg-background px-4 py-3">{footer}</div>}
            </div>
        </div>
    );
}

/** The DR 09 stepper: "Step N of M" over a 5px track filled to the step, the step's name level with it. */
export function Stepper({ step, total, name }: { step: number; total: number; name?: string }) {
    const fill = total > 0 ? Math.min(Math.max(step / total, 0), 1) : 0;
    return (
        <div className="space-y-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(Math.max(step, 0), total)} aria-label={name ? `Step ${step} of ${total}, ${name}` : `Step ${step} of ${total}`}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-foreground">{`Step ${step} of ${total}`}</span>
                {name && <span className="min-w-0 truncate text-right text-xs text-muted-foreground">{name}</span>}
            </div>
            <div className="h-[5px] overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.round(fill * 1000) / 10}%` }} />
            </div>
        </div>
    );
}

/** The phone's primary button. */
export function PhoneButton({ label, secondary = false, disabled = false, onClick }: { label: string; secondary?: boolean; disabled?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:opacity-40",
                secondary ? "border border-border bg-card text-foreground hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
        >
            {label}
        </button>
    );
}
