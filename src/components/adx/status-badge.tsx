import { cn } from "@/lib/utils";
import type { StatusMeta, Tone } from "@/types";

const toneClasses: Record<Tone, string> = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    neutral: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
    status: StatusMeta;
    className?: string;
}

/** Soft tinted pill used for every entity status across the console. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                toneClasses[status.tone],
                className
            )}
        >
            {status.label}
        </span>
    );
}

interface TrafficLightProps {
    tone: Tone;
    className?: string;
}

/** Small colored dot for traffic-light severity (alerts, system health). */
export function TrafficLight({ tone, className }: TrafficLightProps) {
    const dotClasses: Record<Tone, string> = {
        success: "bg-success",
        warning: "bg-warning",
        danger: "bg-danger",
        info: "bg-info",
        neutral: "bg-muted-foreground/40",
    };
    return <span className={cn("inline-block size-2 shrink-0 rounded-full", dotClasses[tone], className)} />;
}
