"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import { FieldList } from "@/components/adx/simple-table";
import { formatCompactINR, formatINR } from "@/lib/format";
import type { Listing, StatusMeta } from "@/types";

interface CampaignCreateProps {
    listings: Listing[];
}

const steps = ["Select sites", "Flight and budget", "Creatives", "Review"];

const availabilityFor = (listing: Listing): StatusMeta => {
    if (listing.status === "live") return { label: "2 slots left", tone: "warning" };
    if (listing.status === "paused") return { label: "From 21 Apr", tone: "info" };
    return { label: "Available", tone: "success" };
};

const cityOptions = ["Mumbai", "Delhi NCR", "Bengaluru", "Hyderabad", "Pune"];
const typeOptions = ["Static", "Digital", "Transit", "Mall"];

export function CampaignCreate({ listings }: CampaignCreateProps) {
    const router = useRouter();
    const [selected, setSelected] = React.useState<Set<string>>(
        new Set(listings.slice(0, 2).map((listing) => listing.id))
    );
    const [budgetCap, setBudgetCap] = React.useState([250000]);

    const toggle = (id: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectedListings = listings.filter((listing) => selected.has(listing.id));
    const weeklyTotal = selectedListings.reduce(
        (sum, listing) => sum + Math.round(listing.monthlyRate / 4),
        0
    );
    const estimatedCost = weeklyTotal * 4;
    const averageWeekly = selectedListings.length
        ? Math.round(weeklyTotal / selectedListings.length)
        : 0;

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/campaigns"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Campaigns
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            New campaign
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Zomato · brief received 22 Apr
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" asChild>
                            <Link href="/campaigns">Back</Link>
                        </Button>
                        <Button
                            disabled={selected.size === 0}
                            onClick={() => {
                                toast.success("Sites locked. Next: creatives", {
                                    description: `${selected.size} sites held for 24 hours.`,
                                });
                                router.push("/moderation");
                            }}
                        >
                            Continue to creatives
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stepper */}
            <Card className="rounded-lg border-border shadow-none">
                <ol className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4">
                    {steps.map((step, index) => {
                        const active = index === 0;
                        return (
                            <li key={step} className="flex items-center gap-2.5">
                                <span
                                    className={cn(
                                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                                        active
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {index + 1}
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
                {/* Sites table */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <h3 className="px-5 pb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Select sites
                    </h3>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-y bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="w-10 px-5 py-2.5" />
                                <th className="px-3 py-2.5">Site</th>
                                <th className="px-3 py-2.5">City</th>
                                <th className="px-3 py-2.5">Type</th>
                                <th className="px-3 py-2.5 text-right">Weekly rate</th>
                                <th className="px-3 py-2.5">Availability</th>
                            </tr>
                        </thead>
                        <tbody>
                            {listings.slice(0, 8).map((listing) => {
                                const weekly = Math.round(listing.monthlyRate / 4);
                                return (
                                    <tr
                                        key={listing.id}
                                        onClick={() => toggle(listing.id)}
                                        className={cn(
                                            "cursor-pointer border-b transition-colors last:border-0",
                                            selected.has(listing.id)
                                                ? "bg-primary/[0.04]"
                                                : "hover:bg-muted/40"
                                        )}
                                    >
                                        <td className="px-5 py-3">
                                            <Checkbox
                                                checked={selected.has(listing.id)}
                                                onCheckedChange={() => toggle(listing.id)}
                                                aria-label={`Select ${listing.title}`}
                                            />
                                        </td>
                                        <td className="px-3 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <InitialsAvatar name={listing.title} size="sm" />
                                                <div>
                                                    <p className="font-medium text-foreground">
                                                        {listing.title}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {listing.publisher}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-muted-foreground">{listing.city}</td>
                                        <td className="px-3 py-3 text-muted-foreground">{listing.type}</td>
                                        <td className="px-3 py-3 text-right font-medium tabular-nums">
                                            {formatINR(weekly)}
                                        </td>
                                        <td className="px-3 py-3">
                                            <StatusBadge status={availabilityFor(listing)} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="px-5 py-3 text-xs text-muted-foreground">
                        Showing 8 of {listings.length} sites that match the brief
                    </p>
                </Card>

                {/* Filters + summary rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Filters
                            </h3>
                            <button
                                type="button"
                                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                onClick={() => toast.info("Filters reset")}
                            >
                                Reset
                            </button>
                        </div>
                        <p className="mt-3 text-xs font-medium text-muted-foreground">City</p>
                        <div className="mt-1.5 space-y-1.5">
                            {cityOptions.map((option, index) => (
                                <label key={option} className="flex items-center gap-2 text-sm">
                                    <Checkbox defaultChecked={index < 3} />
                                    {option}
                                </label>
                            ))}
                        </div>
                        <p className="mt-4 text-xs font-medium text-muted-foreground">Type</p>
                        <div className="mt-1.5 space-y-1.5">
                            {typeOptions.map((option, index) => (
                                <label key={option} className="flex items-center gap-2 text-sm">
                                    <Checkbox defaultChecked={index < 2} />
                                    {option}
                                </label>
                            ))}
                        </div>
                        <p className="mt-4 text-xs font-medium text-muted-foreground">
                            Weekly budget per site
                        </p>
                        <Slider
                            value={budgetCap}
                            onValueChange={setBudgetCap}
                            min={40000}
                            max={250000}
                            step={5000}
                            className="mt-3"
                        />
                        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                            <span>₹40,000</span>
                            <span className="font-medium text-foreground">
                                up to {formatCompactINR(budgetCap[0])}
                            </span>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Selection summary
                        </h3>
                        <FieldList
                            className="mt-3"
                            items={[
                                ["Sites selected", String(selected.size)],
                                ["Estimated cost", formatINR(estimatedCost)],
                                ["Flight", "1 May to 28 May 2026"],
                                ["Duration", "4 weeks"],
                                ["Avg weekly rate", formatINR(averageWeekly)],
                            ]}
                        />
                        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                            Selected sites are held for 24 hours once you continue.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}
