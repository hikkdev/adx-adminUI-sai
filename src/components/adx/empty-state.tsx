import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: React.ReactNode;
    className?: string;
}

/** Centered empty state used inside list cards (per "Publishers · Empty state"). */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center px-6 py-20 text-center", className)}>
            <div className="flex size-24 items-center justify-center rounded-full bg-muted">
                <Icon className="size-10 text-muted-foreground/60" strokeWidth={1.5} />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}
