"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { StatusBadge } from "@/components/adx/status-badge";
import type { StatusMeta } from "@/types";

type IssueKind =
    | "INVALID PAN"
    | "INVALID EMAIL"
    | "CITY MISSING"
    | "DUPLICATE PAN"
    | "GSTIN MISSING"
    | "EMAIL MISSING"
    | "CITY NOT SUPPORTED";

interface ImportRow {
    row: number;
    business: string;
    pan: string;
    email: string;
    city: string;
    issue: IssueKind;
    severity: "error" | "warning";
    badCell: "pan" | "email" | "city";
}

const importRows: ImportRow[] = [
    { row: 14, business: "Lakshmi Ad Works", pan: "LKSH123", email: "accounts@lakshmiads.in", city: "Chennai", issue: "INVALID PAN", severity: "error", badCell: "pan" },
    { row: 27, business: "Grover Outdoor", pan: "GRVRO4521K", email: "grover@@outdoor", city: "Delhi", issue: "INVALID EMAIL", severity: "error", badCell: "email" },
    { row: 41, business: "Sunrise Displays", pan: "SNRSD8812M", email: "hello@sunrisedisplays.in", city: "", issue: "CITY MISSING", severity: "error", badCell: "city" },
    { row: 58, business: "Sharma Hoardings", pan: "ABCDE1234F", email: "sanjay2@sharma.in", city: "Bengaluru", issue: "DUPLICATE PAN", severity: "error", badCell: "pan" },
    { row: 73, business: "Kaveri Media", pan: "KVRIM3391P", email: "kaveri@media.in", city: "Mysuru", issue: "GSTIN MISSING", severity: "warning", badCell: "city" },
    { row: 89, business: "North Star Signs", pan: "NRTHS7745Q", email: "", city: "Gurugram", issue: "EMAIL MISSING", severity: "error", badCell: "email" },
    { row: 102, business: "Deccan Panels", pan: "DCCN552", email: "ops@deccanpanels.in", city: "Hyderabad", issue: "INVALID PAN", severity: "error", badCell: "pan" },
    { row: 118, business: "Coastal Ads", pan: "CSTLA9021R", email: "team@coastalads.in", city: "Port Blair", issue: "CITY NOT SUPPORTED", severity: "warning", badCell: "city" },
];

const steps = ["Upload file", "Map columns", "Review and import"];

type ChipValue = "all" | "errors" | "warnings" | "valid";

export function ImportView() {
    const router = useRouter();
    const [chip, setChip] = React.useState<ChipValue>("errors");

    const issueMeta = (row: ImportRow): StatusMeta => ({
        label: row.issue,
        tone: row.severity === "error" ? "danger" : "warning",
    });

    const visible =
        chip === "all" || chip === "errors" || chip === "warnings"
            ? importRows.filter((row) =>
                  chip === "errors"
                      ? row.severity === "error"
                      : chip === "warnings"
                        ? row.severity === "warning"
                        : true
              )
            : [];

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/publishers"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Publishers
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            Import publishers
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            publishers-master.csv · 248 rows · uploaded 2 minutes ago
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/publishers">Cancel import</Link>
                        </Button>
                        <Button
                            onClick={() => {
                                toast.success("231 publishers imported", {
                                    description: "Activation links with the KYC checklist are on their way.",
                                });
                                router.push("/publishers");
                            }}
                        >
                            Import 231 valid rows
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stepper */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                    {steps.map((step, index) => {
                        const done = index < 2;
                        const active = index === 2;
                        return (
                            <li key={step} className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                        done && "bg-success text-white",
                                        active && "bg-primary text-primary-foreground",
                                        !done && !active && "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {done ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span
                                    className={cn(
                                        "text-sm font-medium",
                                        active ? "text-foreground" : "text-muted-foreground"
                                    )}
                                >
                                    {step}
                                </span>
                                {index < steps.length - 1 && (
                                    <ChevronRight className="size-4 text-muted-foreground/50" />
                                )}
                            </li>
                        );
                    })}
                    <span className="ml-auto text-xs text-muted-foreground">Step 3 of 3</span>
                </ol>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard stat={{ id: "rows", label: "Rows found", value: "248" }} />
                <KpiCard stat={{ id: "valid", label: "Valid", value: "231", deltaTone: "positive", hint: "ready to import" }} />
                <KpiCard stat={{ id: "errors", label: "Errors", value: "12", deltaTone: "negative", hint: "skipped unless fixed" }} />
                <KpiCard stat={{ id: "warnings", label: "Warnings", value: "5", hint: "imported with gaps" }} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterChips<ChipValue>
                    value={chip}
                    onChange={setChip}
                    chips={[
                        { value: "all", label: "All", count: 248 },
                        { value: "errors", label: "Errors", count: 12 },
                        { value: "warnings", label: "Warnings", count: 5 },
                        { value: "valid", label: "Valid", count: 231 },
                    ]}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 bg-card"
                    onClick={() => toast.success("Error report downloaded")}
                >
                    Download error report
                </Button>
            </div>

            {chip === "valid" ? (
                <Card className="rounded-lg border-border p-10 text-center shadow-none">
                    <Check className="mx-auto size-8 text-success" />
                    <p className="mt-3 text-sm font-medium text-foreground">
                        231 rows passed every check
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        They import untouched. Fix the flagged rows to include them too.
                    </p>
                </Card>
            ) : (
                <Card className="overflow-hidden rounded-lg border-border shadow-none">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-2.5">Row</th>
                                <th className="px-4 py-2.5">Business name</th>
                                <th className="px-4 py-2.5">PAN</th>
                                <th className="px-4 py-2.5">Email</th>
                                <th className="px-4 py-2.5">City</th>
                                <th className="px-4 py-2.5">Issue</th>
                                <th className="px-4 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((row) => (
                                <tr key={row.row} className="border-b last:border-0">
                                    <td className="px-4 py-3 text-muted-foreground">{row.row}</td>
                                    <td className="px-4 py-3 font-medium text-foreground">
                                        {row.business}
                                    </td>
                                    <td
                                        className={cn(
                                            "px-4 py-3",
                                            row.badCell === "pan"
                                                ? "font-medium text-danger"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {row.pan || "Missing"}
                                    </td>
                                    <td
                                        className={cn(
                                            "px-4 py-3",
                                            row.badCell === "email"
                                                ? "font-medium text-danger"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {row.email || "Missing"}
                                    </td>
                                    <td
                                        className={cn(
                                            "px-4 py-3",
                                            row.badCell === "city"
                                                ? "font-medium text-danger"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {row.city || "Missing"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={issueMeta(row)} />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 bg-card px-2.5 text-xs"
                                            onClick={() => toast.info(`Row ${row.row} opens for inline editing.`)}
                                        >
                                            Fix
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="text-sm">
                    <p className="font-medium text-foreground">
                        Errors are skipped, warnings import with gaps
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                        Fix rows inline, or re-upload a corrected file. Duplicate PANs merge into the
                        existing publisher record.
                    </p>
                    <button
                        type="button"
                        className="mt-1.5 text-sm font-medium text-warning underline-offset-4 hover:underline"
                        onClick={() => toast.info("Upload a corrected CSV to replace this batch.")}
                    >
                        Re-upload file
                    </button>
                </div>
            </div>
        </div>
    );
}
