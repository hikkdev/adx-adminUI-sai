import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface SectionCardProps {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
}

/** White settings/detail card with a titled header row, body, optional footer. */
export function SectionCard({
    title,
    description,
    actions,
    footer,
    children,
    className,
    contentClassName,
}: SectionCardProps) {
    return (
        <Card className={cn("rounded-lg border-border shadow-none", className)}>
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                <div>
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                    {description && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                    )}
                </div>
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
            </div>
            <div className={cn("px-5 py-4", contentClassName)}>{children}</div>
            {footer && <div className="border-t px-5 py-3">{footer}</div>}
        </Card>
    );
}
