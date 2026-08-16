import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    className?: string;
    /** "section" renders a smaller h2 for headers embedded inside a page. */
    size?: "page" | "section";
}

/** Standard page heading row: title + optional subtitle left, actions right. */
export function PageHeader({
    title,
    subtitle,
    actions,
    className,
    size = "page",
}: PageHeaderProps) {
    const Heading = size === "page" ? "h1" : "h2";
    return (
        <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
            <div className="min-w-0">
                <Heading
                    className={cn(
                        "font-semibold tracking-tight text-foreground",
                        size === "page" ? "text-2xl" : "text-lg"
                    )}
                >
                    {title}
                </Heading>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
