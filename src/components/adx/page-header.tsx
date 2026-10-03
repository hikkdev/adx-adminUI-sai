import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    className?: string;
    /** "section" renders a smaller h2 for headers embedded inside a page. */
    size?: "page" | "section";
}

/**
 * Standard page heading row: title + optional subtitle left, actions right —
 * on every page, however long the subtitle (the owner, 1 Oct 2026: a long
 * description had wrapped Print partners' button under it, on the left).
 * Only a phone-width screen stacks the actions under the text.
 */
export function PageHeader({
    title,
    subtitle,
    actions,
    className,
    size = "page",
}: PageHeaderProps) {
    const Heading = size === "page" ? "h1" : "h2";
    return (
        <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
            <div className="min-w-0 flex-1">
                <Heading
                    className={cn(
                        "font-semibold tracking-tight text-foreground",
                        size === "page" ? "text-2xl" : "text-lg"
                    )}
                >
                    {title}
                </Heading>
                {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
        </div>
    );
}
