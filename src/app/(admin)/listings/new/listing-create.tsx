"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
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
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { StatusBadge } from "@/components/adx/status-badge";
import type { Publisher } from "@/types";

interface ListingCreateProps {
    publishers: Publisher[];
}

const inventoryTypes = ["Static", "Digital", "Transit", "Mall"];

export function ListingCreate({ publishers }: ListingCreateProps) {
    const router = useRouter();
    const [siteName, setSiteName] = React.useState("Andheri East Metro Bridge Gantry");
    const [publisherId, setPublisherId] = React.useState(publishers[0]?.id ?? "");
    const [city, setCity] = React.useState("Mumbai");
    const [inventoryType, setInventoryType] = React.useState("Static");
    const [weeklyRate, setWeeklyRate] = React.useState("1,85,000");

    const publisher = publishers.find((candidate) => candidate.id === publisherId);
    const kycVerified = publisher?.kycStatus === "verified";

    const saveDraft = () => {
        toast.success("Draft saved", {
            description: `${siteName} stays hidden until you publish it.`,
        });
        router.push("/listings");
    };

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/listings"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Listings
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Add inventory
                    </h1>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="bg-card" onClick={saveDraft}>
                            Save draft
                        </Button>
                        <Button
                            disabled={!kycVerified}
                            title={kycVerified ? undefined : "Publisher KYC must be verified first"}
                            onClick={() => {
                                toast.success(`${siteName} submitted for review`);
                                router.push("/listings");
                            }}
                        >
                            Submit for review
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Form */}
                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Site
                        </h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5 md:col-span-2">
                                <Label htmlFor="lst-name">Site name</Label>
                                <Input
                                    id="lst-name"
                                    value={siteName}
                                    onChange={(event) => setSiteName(event.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Shown to advertisers in search and on the map
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Publisher</Label>
                                <Select value={publisherId} onValueChange={setPublisherId}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {publishers.map((option) => (
                                            <SelectItem key={option.id} value={option.id}>
                                                {option.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>City</Label>
                                <Select value={city} onValueChange={setCity}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {["Mumbai", "Bengaluru", "Delhi", "Hyderabad", "Pune", "Chennai"].map(
                                            (option) => (
                                                <SelectItem key={option} value={option}>
                                                    {option}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <Label htmlFor="lst-address">Address</Label>
                                <Input
                                    id="lst-address"
                                    defaultValue="Western Express Highway, opposite Metro Pillar 214"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="lst-pin">Pincode</Label>
                                <Input id="lst-pin" defaultValue="400099" inputMode="numeric" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Inventory type</Label>
                                <div className="flex gap-1.5">
                                    {inventoryTypes.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setInventoryType(option)}
                                            className={cn(
                                                "h-10 flex-1 rounded-lg border text-sm font-medium transition-colors",
                                                inventoryType === option
                                                    ? "border-foreground bg-foreground text-background"
                                                    : "bg-card text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Specification
                        </h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="lst-w">Width</Label>
                                    <Input id="lst-w" defaultValue="40 ft" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="lst-h">Height</Label>
                                    <Input id="lst-h" defaultValue="20 ft" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Illumination</Label>
                                <Select defaultValue="backlit">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="nonlit">Non-lit</SelectItem>
                                        <SelectItem value="frontlit">Front-lit</SelectItem>
                                        <SelectItem value="backlit">Back-lit</SelectItem>
                                        <SelectItem value="led">Digital / LED</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Facing</Label>
                                <Select defaultValue="ns">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ns">North to South</SelectItem>
                                        <SelectItem value="sn">South to North</SelectItem>
                                        <SelectItem value="ew">East to West</SelectItem>
                                        <SelectItem value="junction">Junction, multi-face</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Traffic grade</Label>
                                <Select defaultValue="aplus">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="aplus">A+ Prime arterial</SelectItem>
                                        <SelectItem value="a">A High street</SelectItem>
                                        <SelectItem value="b">B Neighbourhood</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Commercials
                        </h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="lst-rate">Base rate per week (₹)</Label>
                                <Input
                                    id="lst-rate"
                                    value={weeklyRate}
                                    onChange={(event) => setWeeklyRate(event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Minimum booking duration</Label>
                                <Select defaultValue="2w">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1w">1 week</SelectItem>
                                        <SelectItem value="2w">2 weeks</SelectItem>
                                        <SelectItem value="4w">4 weeks</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="lst-print">Printing charge</Label>
                                <Input id="lst-print" defaultValue="₹32 per sq ft" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="lst-avail">Availability start date</Label>
                                <Input id="lst-avail" defaultValue="14 Apr 2026" />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Preview rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Marketplace preview
                        </h3>
                        <div className="mt-3 overflow-hidden rounded-lg border">
                            <div className="flex aspect-[16/9] items-center justify-center bg-muted text-xs text-muted-foreground">
                                Site photo pending
                            </div>
                            <div className="p-3.5">
                                <p className="truncate text-sm font-semibold text-foreground">
                                    {siteName || "Untitled site"}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {inventoryType} · {city}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-foreground">
                                    ₹{weeklyRate || "0"}
                                    <span className="text-xs font-normal text-muted-foreground"> / week</span>
                                </p>
                                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-success">
                                    Available from 14 Apr
                                </p>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Draft listings stay hidden from advertisers until you publish.
                        </p>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Before publishing
                        </h3>
                        <ul className="mt-3 space-y-3">
                            <li className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2">
                                    {publisher && <InitialsAvatar name={publisher.name} size="sm" />}
                                    <span className="truncate">Publisher KYC verified</span>
                                </span>
                                <StatusBadge
                                    status={
                                        kycVerified
                                            ? { label: "Verified", tone: "success" }
                                            : { label: "Pending", tone: "warning" }
                                    }
                                />
                            </li>
                            <li className="flex items-center justify-between gap-3 text-sm">
                                <span>Site photo uploaded</span>
                                <StatusBadge status={{ label: "Pending", tone: "warning" }} />
                            </li>
                            <li className="flex items-center justify-between gap-3 text-sm">
                                <span>Rate card approved</span>
                                <StatusBadge status={{ label: "Pending", tone: "warning" }} />
                            </li>
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}
