"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatINR } from "@/lib/format";
import type { RateCard, RateCardSettings, RateMatrixRow } from "@/types";

interface RateCardBuilderProps {
    rateCard: RateCard;
    matrix: RateMatrixRow[];
    settings: RateCardSettings[];
}

const gradeColumns = [
    { key: "premium", label: "Premium" },
    { key: "gradeA", label: "Grade A" },
    { key: "gradeB", label: "Grade B" },
    { key: "gradeC", label: "Grade C" },
] as const;

export function RateCardBuilder({ rateCard, matrix, settings }: RateCardBuilderProps) {
    const [rates, setRates] = React.useState(matrix);
    const [dirty, setDirty] = React.useState(false);
    const nextVersion = rateCard.version + 1;

    const updateCell = (
        rowIndex: number,
        key: (typeof gradeColumns)[number]["key"],
        raw: string
    ) => {
        const numeric = Number(raw.replace(/[^\d]/g, ""));
        setRates((current) =>
            current.map((row, index) =>
                index === rowIndex ? { ...row, [key]: Number.isNaN(numeric) ? 0 : numeric } : row
            )
        );
        setDirty(true);
    };

    return (
        <div className="space-y-5 pb-24">
            <div>
                <Link
                    href="/pricing/model"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Pricing model
                </Link>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {rateCard.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {rateCard.coverage} · currently v{rateCard.version}
                </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="border-b px-5 py-4">
                        <h2 className="text-base font-semibold text-foreground">Base weekly rate</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Values in rupees per week, before illumination and size multipliers.
                        </p>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Media type</th>
                                {gradeColumns.map((column) => (
                                    <th key={column.key} className="px-3 py-2.5 text-right">
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rates.map((row, rowIndex) => (
                                <tr key={row.mediaType} className="border-b last:border-0">
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        {row.mediaType}
                                    </td>
                                    {gradeColumns.map((column) => {
                                        const value = row[column.key];
                                        return (
                                            <td key={column.key} className="px-3 py-2 text-right">
                                                {value === null ? (
                                                    <span className="text-xs text-muted-foreground/60">
                                                        Not sold
                                                    </span>
                                                ) : (
                                                    <Input
                                                        value={formatINR(value)}
                                                        onChange={(event) =>
                                                            updateCell(rowIndex, column.key, event.target.value)
                                                        }
                                                        className="h-9 w-28 text-right tabular-nums"
                                                        aria-label={`${row.mediaType} ${column.label} weekly rate`}
                                                    />
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="px-5 py-3 text-xs text-muted-foreground">
                        Blank cells mean the media type is not sold in that locality grade.
                    </p>
                </Card>

                <Card className="h-fit rounded-lg border-border shadow-none">
                    <h2 className="border-b px-5 py-4 text-base font-semibold text-foreground">
                        Card settings
                    </h2>
                    <ul className="divide-y px-5">
                        {settings.map((setting) => (
                            <li
                                key={setting.label}
                                className="flex items-center justify-between gap-4 py-3.5"
                            >
                                <div>
                                    <p className="text-sm font-medium text-foreground">{setting.label}</p>
                                    <p className="text-xs text-muted-foreground">{setting.helper}</p>
                                </div>
                                {setting.toggle ? (
                                    <Switch defaultChecked onCheckedChange={() => setDirty(true)} />
                                ) : (
                                    <span className="shrink-0 text-sm font-medium text-foreground">
                                        {setting.value}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <p className="border-t px-5 py-3.5 text-xs text-muted-foreground">
                        Floor price is 82% of card rate. Quotes below the floor need Finance
                        approval.
                    </p>
                </Card>
            </div>

            {/* Publish bar */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
                <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3 pl-[267px]">
                    <div>
                        <p className="text-sm font-medium text-foreground">
                            Publishing creates version {nextVersion}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Live bookings keep the price they were booked at.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card"
                            disabled={!dirty}
                            onClick={() => {
                                setDirty(false);
                                toast.success("Draft saved");
                            }}
                        >
                            Save draft
                        </Button>
                        <Button
                            onClick={() =>
                                toast.success(`Version ${nextVersion} published`, {
                                    description: "New bookings price against this version immediately.",
                                })
                            }
                        >
                            Publish version {nextVersion}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
