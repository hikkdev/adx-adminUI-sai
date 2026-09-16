import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface TopListItem {
    key: string;
    label: string;
    /** The section's reference (PUB-0001, AGT-0042) under the name; null when the party has none yet. */
    displayId: string | null;
    href: string | null;
    /** The figure on the right. */
    primary: string;
    /** Under the figure. */
    secondary?: string;
}

export interface TopListProps {
    title: string;
    hint?: string;
    items: TopListItem[];
    emptyMessage?: string;
    className?: string;
}

/**
 * A top ten — the ten largest by a sum in the window, each row the
 * party's page. The rank is the row's position in the server's order.
 */
export function TopList({ title, hint, items, emptyMessage = "Nobody in this window.", className }: TopListProps) {
    return (
        <Card className={cn("rounded-lg border-border p-5 shadow-none", className)}>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
            {items.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
                <ol className="mt-2 divide-y">
                    {items.map((item, index) => (
                        <li key={item.key} className="flex items-center gap-3 py-2.5">
                            <span className="w-5 text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                                {item.href ? (
                                    <Link href={item.href} className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:underline">
                                        {item.label}
                                    </Link>
                                ) : (
                                    <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                                )}
                                {item.displayId ? <p className="text-xs text-muted-foreground">{item.displayId}</p> : null}
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-semibold tabular-nums text-foreground">{item.primary}</p>
                                {item.secondary ? <p className="text-xs text-muted-foreground">{item.secondary}</p> : null}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}
