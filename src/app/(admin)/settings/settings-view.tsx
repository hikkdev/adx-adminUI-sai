"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";

const sections = [
    { id: "marketplace", label: "Marketplace" },
    { id: "commission", label: "Commission" },
    { id: "payouts", label: "Payouts" },
    { id: "verification", label: "Verification" },
    { id: "notifications", label: "Notifications" },
    { id: "danger", label: "Danger zone" },
];

const cities = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];

export function SettingsView() {
    const [dirtyKeys, setDirtyKeys] = React.useState<Set<string>>(new Set());
    const [activeSection, setActiveSection] = React.useState("marketplace");

    const markDirty = (key: string) =>
        setDirtyKeys((current) => new Set(current).add(key));

    const save = () => {
        setDirtyKeys(new Set());
        toast.success("Settings saved", {
            description: "Marketplace defaults apply to new bookings immediately.",
        });
    };

    return (
        <div className="space-y-5 pb-20">
            <PageHeader
                title="Settings"
                subtitle="Marketplace defaults, fees, and platform behaviour"
            />

            <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
                {/* Section nav */}
                <nav className="h-fit space-y-1 xl:sticky xl:top-[81px]">
                    {sections.map((section) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            onClick={() => setActiveSection(section.id)}
                            className={cn(
                                "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                activeSection === section.id
                                    ? "bg-muted text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {section.label}
                        </a>
                    ))}
                </nav>

                <div className="min-w-0 space-y-5">
                    <div id="marketplace" className="scroll-mt-24">
                        <SectionCard
                            title="Marketplace defaults"
                            description="Applied to every new listing and booking"
                        >
                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label>Default currency</Label>
                                    <Select defaultValue="inr" onValueChange={() => markDirty("currency")}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="inr">INR (₹)</SelectItem>
                                            <SelectItem value="usd">USD ($)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Shown to every marketplace participant
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Minimum booking window</Label>
                                    <Select defaultValue="7" onValueChange={() => markDirty("window")}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="7">7 days</SelectItem>
                                            <SelectItem value="14">14 days</SelectItem>
                                            <SelectItem value="30">30 days</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Shortest flight an advertiser can book
                                    </p>
                                </div>
                                <label className="flex items-center justify-between gap-4 md:col-span-2">
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">
                                            Auto-publish approved listings
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            Skip the manual publish step after review approval
                                        </span>
                                    </span>
                                    <Switch defaultChecked onCheckedChange={() => markDirty("autopub")} />
                                </label>
                            </div>
                        </SectionCard>
                    </div>

                    <div id="commission" className="scroll-mt-24">
                        <SectionCard
                            title="Commission"
                            description="Platform take rate on booked media"
                        >
                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="set-take">Standard take rate (%)</Label>
                                    <Input
                                        id="set-take"
                                        defaultValue="12.5"
                                        inputMode="decimal"
                                        onChange={() => markDirty("take")}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="set-agent">Agent commission (%)</Label>
                                    <Input
                                        id="set-agent"
                                        defaultValue="4"
                                        inputMode="decimal"
                                        onChange={() => markDirty("agent")}
                                    />
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    <div id="payouts" className="scroll-mt-24">
                        <SectionCard title="Payouts" description="Settlement cadence and thresholds">
                            <div className="grid gap-5 md:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label>Payout cadence</Label>
                                    <Select defaultValue="weekly" onValueChange={() => markDirty("cadence")}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="weekly">Weekly · Fridays 6 PM IST</SelectItem>
                                            <SelectItem value="biweekly">Every two weeks</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="set-min">Minimum withdrawal (₹)</Label>
                                    <Input
                                        id="set-min"
                                        defaultValue="5,000"
                                        onChange={() => markDirty("min")}
                                    />
                                </div>
                                <label className="flex items-center justify-between gap-4 md:col-span-2">
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">
                                            Dual approval above ₹1,00,000
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            Large withdrawals need a second Finance approver
                                        </span>
                                    </span>
                                    <Switch defaultChecked onCheckedChange={() => markDirty("dual")} />
                                </label>
                            </div>
                        </SectionCard>
                    </div>

                    <div id="verification" className="scroll-mt-24">
                        <SectionCard
                            title="Verification"
                            description="KYC requirements before payouts unlock"
                        >
                            <div className="space-y-4">
                                <label className="flex items-center justify-between gap-4">
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">
                                            Require live selfie match
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            Face match against owner ID during onboarding
                                        </span>
                                    </span>
                                    <Switch defaultChecked onCheckedChange={() => markDirty("selfie")} />
                                </label>
                                <div className="space-y-1.5">
                                    <Label>Review SLA</Label>
                                    <Select defaultValue="48" onValueChange={() => markDirty("sla")}>
                                        <SelectTrigger className="md:w-1/2">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="24">24 hours</SelectItem>
                                            <SelectItem value="48">48 hours</SelectItem>
                                            <SelectItem value="72">72 hours</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Active geographies</Label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {cities.map((city) => (
                                            <span
                                                key={city}
                                                className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-foreground"
                                            >
                                                {city}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    <div id="notifications" className="scroll-mt-24">
                        <SectionCard
                            title="Notifications"
                            description="Platform-wide alert defaults for admins"
                        >
                            <div className="space-y-4">
                                {[
                                    ["SLA breach alerts", "Ping the on-call channel when any review SLA breaches"],
                                    ["Payout batch results", "Daily digest of settled and failed payouts"],
                                    ["Weekly platform summary", "Sent every Monday at 9:00 AM IST"],
                                ].map(([title, helper]) => (
                                    <label key={title} className="flex items-center justify-between gap-4">
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">
                                                {title}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">{helper}</span>
                                        </span>
                                        <Switch defaultChecked onCheckedChange={() => markDirty(title)} />
                                    </label>
                                ))}
                            </div>
                        </SectionCard>
                    </div>

                    <div id="danger" className="scroll-mt-24">
                        <SectionCard
                            title="Danger zone"
                            description="Actions that pause commerce for everyone"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        Pause new bookings
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Existing campaigns continue; new checkouts are blocked.
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    onClick={() =>
                                        toast.error("Marketplace paused", {
                                            description: "New bookings are blocked until resumed.",
                                        })
                                    }
                                >
                                    Pause marketplace
                                </Button>
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>

            {/* Sticky save bar */}
            {dirtyKeys.size > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
                    <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3 pl-[267px]">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Unsaved changes</span> ·{" "}
                            {dirtyKeys.size} setting{dirtyKeys.size === 1 ? "" : "s"} modified
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                className="bg-card"
                                onClick={() => setDirtyKeys(new Set())}
                            >
                                Discard
                            </Button>
                            <Button onClick={save}>Save changes</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
