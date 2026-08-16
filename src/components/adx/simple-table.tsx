import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export interface SimpleColumn<T> {
    key: string;
    label: string;
    className?: string;
    render: (row: T) => React.ReactNode;
}

interface SimpleTableProps<T> {
    columns: SimpleColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    emptyMessage?: string;
    className?: string;
}

/** Lightweight bordered table for detail tabs and side panes. */
export function SimpleTable<T>({
    columns,
    rows,
    rowKey,
    emptyMessage = "Nothing here yet.",
    className,
}: SimpleTableProps<T>) {
    return (
        <Card className={cn("overflow-hidden rounded-lg border-border shadow-none", className)}>
            {rows.length ? (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={cn("px-4 py-2.5 font-medium", column.className)}
                                >
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={rowKey(row)} className="border-b last:border-0">
                                {columns.map((column) => (
                                    <td key={column.key} className={cn("px-4 py-3", column.className)}>
                                        {column.render(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
            )}
        </Card>
    );
}

interface FieldListProps {
    items: [string, React.ReactNode][];
    className?: string;
}

/** Label/value rows used on overview cards. */
export function FieldList({ items, className }: FieldListProps) {
    return (
        <dl className={cn("space-y-3 text-sm", className)}>
            {items.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
