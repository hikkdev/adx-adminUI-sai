"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/adx/page-header";

interface SimulatorViewProps {
    defaults: Record<string, string>;
    steps: { step: string; rule: string; factor: string; running: string }[];
}

const inputGroups: { label: string; key: string; options: string[] }[] = [
    { label: "Site", key: "site", options: ["MG Road Billboard · Bengaluru", "Phoenix Atrium 3F · Mumbai", "CP Inner Circle Gantry · Delhi"] },
    { label: "Advertiser", key: "advertiser", options: ["Zomato", "PhonePe", "Nike Run Club", "Swiggy"] },
    { label: "Advertiser category", key: "category", options: ["E-commerce", "FMCG", "BFSI", "Automotive"] },
    { label: "Flight start", key: "flightStart", options: ["1 May 2026", "15 May 2026", "1 Jun 2026"] },
    { label: "Flight end", key: "flightEnd", options: ["28 May 2026", "12 Jun 2026", "30 Jun 2026"] },
    { label: "Duration", key: "duration", options: ["2 weeks", "4 weeks", "8 weeks", "12 weeks"] },
    { label: "Media type", key: "mediaType", options: ["Static hoarding", "Digital billboard", "Transit shelter", "Mall panel"] },
    { label: "Width (ft)", key: "width", options: ["20 ft", "30 ft", "40 ft"] },
    { label: "Height (ft)", key: "height", options: ["10 ft", "15 ft", "20 ft"] },
    { label: "Illumination", key: "illumination", options: ["Non-lit", "Front-lit", "Back-lit", "Digital / LED"] },
    { label: "City tier", key: "cityTier", options: ["Metro", "Tier 1", "Tier 2"] },
    { label: "Locality grade", key: "localityGrade", options: ["Premium", "Grade A", "Grade B", "Grade C"] },
    { label: "Negotiated discount", key: "discount", options: ["0%", "5%", "10%", "15%"] },
];

const emphasisSteps = new Set(["Subtotal (4 weeks)", "Taxable value", "Gross payable", "Net to publisher"]);

export function SimulatorView({ defaults, steps }: SimulatorViewProps) {
    const [inputs, setInputs] = React.useState(defaults);
    const net = steps[steps.length - 1];

    return (
        <div className="space-y-5">
            <PageHeader
                title="Price simulator"
                subtitle="Trace exactly how a quote is built, rule by rule"
                actions={
                    <Button onClick={() => toast.success("Quote shared with the sales desk")}>
                        Share quote
                    </Button>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Inputs
                    </h3>
                    <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        {inputGroups.map((group) => (
                            <div key={group.key} className="space-y-1">
                                <Label className="text-xs">{group.label}</Label>
                                <Select
                                    value={inputs[group.key]}
                                    onValueChange={(value) =>
                                        setInputs((current) => ({ ...current, [group.key]: value }))
                                    }
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {group.options.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                    <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                        The trace recomputes from the live rate card and every active rule.
                    </p>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
                        <h3 className="text-base font-semibold text-foreground">Calculation trace</h3>
                        <div className="text-right">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Net to publisher
                            </p>
                            <p className="text-lg font-semibold text-primary">{net.running}</p>
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Step</th>
                                <th className="px-5 py-2.5">Rule</th>
                                <th className="px-5 py-2.5 text-right">Factor</th>
                                <th className="px-5 py-2.5 text-right">Running</th>
                            </tr>
                        </thead>
                        <tbody>
                            {steps.map((step) => {
                                const emphasized = emphasisSteps.has(step.step);
                                return (
                                    <tr
                                        key={step.step}
                                        className={cn(
                                            "border-b last:border-0",
                                            emphasized && "bg-muted/40"
                                        )}
                                    >
                                        <td
                                            className={cn(
                                                "px-5 py-2.5",
                                                emphasized
                                                    ? "font-semibold text-foreground"
                                                    : "font-medium text-foreground"
                                            )}
                                        >
                                            {step.step}
                                        </td>
                                        <td className="px-5 py-2.5 text-muted-foreground">{step.rule}</td>
                                        <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                                            {step.factor}
                                        </td>
                                        <td
                                            className={cn(
                                                "px-5 py-2.5 text-right tabular-nums",
                                                emphasized ? "font-semibold" : "font-medium"
                                            )}
                                        >
                                            {step.running}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>
            </div>
        </div>
    );
}
