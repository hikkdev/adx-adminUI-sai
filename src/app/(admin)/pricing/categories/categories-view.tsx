"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import type { CategoryCell, CategoryRuleRow } from "@/types";

interface CategoriesViewProps {
    rows: CategoryRuleRow[];
    embedded?: boolean;
    controls: {
        category: string;
        note: string;
        fields: [string, string][];
        permittedCities: string[];
        approvalChain: string[];
    };
}

const mediaColumns = [
    { key: "static", label: "Static" },
    { key: "digital", label: "Digital" },
    { key: "transit", label: "Transit" },
    { key: "mall", label: "Mall" },
] as const;

function CellValue({ value }: { value: CategoryCell }) {
    if (value === "blocked") {
        return <StatusBadge status={{ label: "Blocked", tone: "danger" }} />;
    }
    if (value === "legal") {
        return <StatusBadge status={{ label: "Legal approval", tone: "warning" }} />;
    }
    return (
        <span
            className={cn(
                "font-medium tabular-nums",
                value > 1 ? "text-foreground" : value < 1 ? "text-success" : "text-muted-foreground"
            )}
        >
            {value.toFixed(2)}×
        </span>
    );
}

export function CategoriesView({ rows, controls, embedded }: CategoriesViewProps) {
    const [selected, setSelected] = React.useState(controls.category);

    return (
        <div className="space-y-5">
            <PageHeader
                size={embedded ? "section" : "page"}
                title="Category rules"
                subtitle="Rate multipliers and compliance controls per advertiser category"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.info("Select rows in the matrix to bulk edit.")}
                        >
                            Bulk edit
                        </Button>
                        <Button onClick={() => toast.success("Category rules saved")}>
                            Save changes
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Category</th>
                                {mediaColumns.map((column) => (
                                    <th key={column.key} className="px-4 py-2.5 text-right">
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.category}
                                    onClick={() => setSelected(row.category)}
                                    className={cn(
                                        "cursor-pointer border-b transition-colors last:border-0",
                                        selected === row.category ? "bg-primary/[0.04]" : "hover:bg-muted/40"
                                    )}
                                >
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        {row.category}
                                    </td>
                                    {mediaColumns.map((column) => (
                                        <td key={column.key} className="px-4 py-3 text-right">
                                            <CellValue value={row[column.key]} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>

                <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Category controls
                    </h3>
                    <p className="mt-2 text-base font-semibold text-foreground">{controls.category}</p>
                    <p className="mt-1 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                        {controls.note}
                    </p>
                    <dl className="mt-4 space-y-3 text-sm">
                        {controls.fields.map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-4">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="text-right font-medium text-foreground">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Permitted cities
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {controls.permittedCities.map((city) => (
                            <span
                                key={city}
                                className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium"
                            >
                                {city}
                            </span>
                        ))}
                    </div>

                    <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Approval chain
                    </p>
                    <ol className="mt-2 space-y-2">
                        {controls.approvalChain.map((step, index) => (
                            <li key={step} className="flex items-center gap-2.5 text-sm">
                                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                                    {index + 1}
                                </span>
                                {step}
                            </li>
                        ))}
                    </ol>
                </Card>
            </div>
        </div>
    );
}
