"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import { PAYOUT_BATCH_STATUS_META, type PayoutBatch } from "@/types";

interface PayoutRunsCardProps {
    batches: PayoutBatch[];
}

/** Dashboard "Payout runs" widget, the last few payout batches. */
export function PayoutRunsCard({ batches }: PayoutRunsCardProps) {
    const [filter, setFilter] = React.useState("");

    const visible = batches
        .filter((batch) => batch.status !== "draft")
        .filter((batch) => `#${batch.number}`.includes(filter.trim().toLowerCase()))
        .slice(0, 3);

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Payout runs</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Last three payout batches</p>
            </div>

            <div className="mt-4 flex items-center gap-2">
                <Input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="Filter batches…"
                    className="h-9"
                />
            </div>

            <div className="mt-3 overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Batch</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                            <th className="w-8 px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((batch) => (
                            <tr key={batch.id} className="border-b last:border-0">
                                <td className="px-3 py-2.5">
                                    <StatusBadge status={PAYOUT_BATCH_STATUS_META[batch.status]} />
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="font-medium text-foreground">#{batch.number}</span>{" "}
                                    <span className="text-muted-foreground">{batch.payouts} payouts</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium">
                                    {formatINR(batch.amount)}
                                </td>
                                <td className="px-2 py-2.5">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="size-7">
                                                <MoreHorizontal className="size-4" />
                                                <span className="sr-only">Batch actions</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem asChild>
                                                <Link href="/finance/payouts">View batch</Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem asChild>
                                                <Link href="/finance/payouts">Download report</Link>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-auto flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">Runs weekly · Fridays 6 PM IST</p>
                <Button variant="outline" size="sm" className="h-8" asChild>
                    <Link href="/finance/payouts">View all</Link>
                </Button>
            </div>
        </Card>
    );
}
