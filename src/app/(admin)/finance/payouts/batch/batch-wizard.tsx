"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronLeft, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { FieldList } from "@/components/adx/simple-table";
import { formatINR } from "@/lib/format";
import type { PayoutBatch } from "@/types";

interface BatchWizardProps {
    batch: PayoutBatch;
}

const steps = [
    "Select recipients",
    "Review amounts",
    "Compliance checks",
    "Confirm and release",
];

export function BatchWizard({ batch }: BatchWizardProps) {
    const [currentStep, setCurrentStep] = React.useState(1);

    const publishers = batch.lines.filter((line) => !line.publisher.match(/Kumar|Menon/)).length;
    const flagged = batch.lines.filter((line) => line.flagged);

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/finance/payouts"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Payouts
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Payout batch #{batch.number}
                    </h1>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Draft saved")}
                        >
                            Save draft
                        </Button>
                        <Button
                            onClick={() => {
                                if (currentStep < steps.length - 1) {
                                    setCurrentStep((step) => step + 1);
                                } else {
                                    toast.success("Batch scheduled for release", {
                                        description: batch.scheduledFor,
                                    });
                                }
                            }}
                        >
                            {currentStep < steps.length - 1
                                ? "Continue to review"
                                : "Schedule release"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stepper rail */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
                    {steps.map((step, index) => {
                        const done = index < currentStep;
                        const active = index === currentStep;
                        return (
                            <li key={step} className="flex items-center gap-2.5">
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
                            </li>
                        );
                    })}
                </ol>
            </Card>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Amounts table */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <h3 className="px-5 pb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Review amounts
                    </h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2">Recipient</th>
                                <th className="px-5 py-2">Type</th>
                                <th className="px-5 py-2">Method</th>
                                <th className="px-5 py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batch.lines.map((line) => {
                                const [name, city] = line.publisher.split(" · ");
                                const isAgent = /Kumar|Menon/.test(name);
                                return (
                                    <tr key={line.id} className="border-b last:border-0">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <InitialsAvatar name={name} size="sm" />
                                                <div>
                                                    <p className="font-medium text-foreground">{name}</p>
                                                    <p className="text-xs text-muted-foreground">{city}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-muted-foreground">
                                            {line.flagged ? (
                                                <span className="inline-flex items-center gap-1 text-warning">
                                                    <TriangleAlert className="size-3.5" />
                                                    {line.flagged}
                                                </span>
                                            ) : isAgent ? (
                                                "Agent"
                                            ) : (
                                                "Publisher"
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-muted-foreground">{line.upiOrAccount}</td>
                                        <td className="px-5 py-3 text-right font-medium">
                                            {formatINR(line.netPayout)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                        <span className="text-muted-foreground">
                            {batch.lines.length} of {batch.payouts} recipients shown
                        </span>
                        <button
                            type="button"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => toast.info("Full recipient list opens in the review step.")}
                        >
                            View all {batch.payouts}
                        </button>
                    </div>
                </Card>

                {/* Right rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Batch total
                        </h3>
                        <p className="text-metric mt-2 text-foreground">{formatINR(batch.amount)}</p>
                        <FieldList
                            className="mt-4"
                            items={[
                                ["Recipients", String(batch.payouts)],
                                ["Publishers", String(27)],
                                ["Agents", String(15)],
                            ]}
                        />
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Pre-flight
                        </h3>
                        <ul className="mt-3 space-y-2.5 text-sm">
                            <li className="flex items-center gap-2">
                                <Check className="size-4 text-success" />
                                <span className="flex-1">All KYC verified</span>
                                <span className="text-xs text-success">Passed</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <Check className="size-4 text-success" />
                                <span className="flex-1">Wallet float sufficient</span>
                                <span className="text-xs text-success">Passed</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <TriangleAlert className="size-4 text-warning" />
                                <span className="flex-1">
                                    {flagged.length} account verification pending
                                </span>
                                <Link
                                    href="/kyc"
                                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                                >
                                    Review
                                </Link>
                            </li>
                        </ul>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Schedule
                        </h3>
                        <FieldList
                            className="mt-3"
                            items={[
                                ["Release window", "Fri 25 Apr, 6:00 PM"],
                                ["Cut-off", "Fri 25 Apr, 4:00 PM"],
                                ["Expected settlement", "Mon 28 Apr"],
                            ]}
                        />
                        <p className="mt-3 text-xs text-muted-foreground">{batch.scheduledFor}</p>
                    </Card>
                </div>
            </div>
        </div>
    );
}
