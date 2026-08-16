"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import type { StatusMeta } from "@/types";

type ScheduleStatus = "active" | "paused" | "failed";

const statusMeta: Record<ScheduleStatus, StatusMeta> = {
    active: { label: "Active", tone: "success" },
    paused: { label: "Paused", tone: "neutral" },
    failed: { label: "Failed", tone: "danger" },
};

interface Schedule {
    report: string;
    helper: string;
    format: "CSV" | "XLSX" | "PDF";
    frequency: string;
    recipients: string;
    others: string;
    nextRun: string;
    nextRunHint: string;
    status: ScheduleStatus;
}

const schedules: Schedule[] = [
    { report: "Publisher payout register", helper: "Settled and pending payouts by publisher", format: "CSV", frequency: "Every Monday", recipients: "finance@adx.co.in", others: "+2 others", nextRun: "27 Jul, 6:00 AM", nextRunHint: "in 14 hours", status: "active" },
    { report: "GMV and take-rate summary", helper: "Marketplace revenue rolled up by city", format: "XLSX", frequency: "Monthly on the 1st", recipients: "leadership@adx.co.in", others: "+4 others", nextRun: "01 Aug, 7:00 AM", nextRunHint: "in 6 days", status: "active" },
    { report: "KYC verification log", helper: "Submissions, approvals and rejections", format: "CSV", frequency: "Daily", recipients: "compliance@adx.co.in", others: "Single recipient", nextRun: "27 Jul, 5:30 AM", nextRunHint: "in 13 hours", status: "active" },
    { report: "Advertiser invoice pack", helper: "Tax invoices with GSTIN breakdown", format: "PDF", frequency: "Monthly on the 5th", recipients: "accounts@adx.co.in", others: "+1 other", nextRun: "05 Aug, 9:00 AM", nextRunHint: "Paused since 12 Jul", status: "paused" },
    { report: "Site occupancy report", helper: "Fill rate by hoarding and city", format: "XLSX", frequency: "Every Friday", recipients: "ops@adx.co.in", others: "+3 others", nextRun: "31 Jul, 6:00 AM", nextRunHint: "Last run bounced", status: "failed" },
];

type ChipValue = "all" | ScheduleStatus;

export function ExportsView() {
    const [chip, setChip] = React.useState<ChipValue>("all");
    const [format, setFormat] = React.useState("CSV");

    const visible =
        chip === "all" ? schedules : schedules.filter((schedule) => schedule.status === chip);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Scheduled exports"
                subtitle="Recurring report deliveries to inboxes"
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.info("Past deliveries with download links open here.")}
                    >
                        Export history
                    </Button>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard stat={{ id: "active", label: "Active schedules", value: "12" }} />
                <KpiCard stat={{ id: "week", label: "Delivered this week", value: "34" }} />
                <KpiCard stat={{ id: "failed", label: "Failed this week", value: "1", deltaTone: "negative", hint: "needs retry" }} />
                <KpiCard stat={{ id: "recipients", label: "Unique recipients", value: "18" }} />
            </div>

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: schedules.length },
                    { value: "active", label: "Active", count: schedules.filter((s) => s.status === "active").length },
                    { value: "paused", label: "Paused", count: schedules.filter((s) => s.status === "paused").length },
                    { value: "failed", label: "Failed", count: schedules.filter((s) => s.status === "failed").length },
                ]}
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="border-b px-5 py-4">
                        <h3 className="text-base font-semibold text-foreground">Scheduled reports</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">12 schedules configured</p>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Report</th>
                                <th className="px-4 py-2.5">Format</th>
                                <th className="px-4 py-2.5">Frequency</th>
                                <th className="px-4 py-2.5">Recipients</th>
                                <th className="px-4 py-2.5">Next run</th>
                                <th className="px-4 py-2.5">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((schedule) => (
                                <tr key={schedule.report} className="border-b last:border-0">
                                    <td className="px-5 py-3">
                                        <p className="font-medium text-foreground">{schedule.report}</p>
                                        <p className="text-xs text-muted-foreground">{schedule.helper}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                            {schedule.format}
                                        </code>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {schedule.frequency}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-foreground">{schedule.recipients}</p>
                                        <p className="text-xs text-muted-foreground">{schedule.others}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-foreground">{schedule.nextRun}</p>
                                        <p
                                            className={cn(
                                                "text-xs",
                                                schedule.status === "failed"
                                                    ? "text-danger"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            {schedule.nextRunHint}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={statusMeta[schedule.status]} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>

                <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        New export
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Schedule a recurring delivery
                    </p>
                    <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label>Report type</Label>
                            <Select defaultValue="payout">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="payout">Publisher payout register</SelectItem>
                                    <SelectItem value="gmv">GMV and take-rate summary</SelectItem>
                                    <SelectItem value="kyc">KYC verification log</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Date range</Label>
                            <Select defaultValue="30d">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="30d">Rolling last 30 days</SelectItem>
                                    <SelectItem value="7d">Rolling last 7 days</SelectItem>
                                    <SelectItem value="mtd">Month to date</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Format</Label>
                            <div className="flex gap-1.5">
                                {["CSV", "XLSX", "PDF"].map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setFormat(option)}
                                        className={cn(
                                            "h-8 flex-1 rounded-lg border text-xs font-medium transition-colors",
                                            format === option
                                                ? "border-foreground bg-foreground text-background"
                                                : "bg-card text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Frequency</Label>
                            <Select defaultValue="monday">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monday">Every Monday, 6:00 AM</SelectItem>
                                    <SelectItem value="daily">Daily, 5:30 AM</SelectItem>
                                    <SelectItem value="first">Monthly on the 1st</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="exp-recipients">Recipients</Label>
                            <Input id="exp-recipients" defaultValue="finance@adx.co.in" />
                            <p className="text-xs text-muted-foreground">
                                Separate multiple addresses with commas
                            </p>
                        </div>
                        <Button
                            className="w-full"
                            onClick={() => toast.success("Export scheduled", { description: `${format}, every Monday 6:00 AM` })}
                        >
                            Schedule export
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
