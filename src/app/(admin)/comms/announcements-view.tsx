"use client";

import * as React from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";

const audiences = ["All users", "Publishers", "Advertisers", "Agents"];

const recent = [
    { title: "Instant payouts now default for Gold agents", status: { label: "Sent", tone: "success" as const }, date: "18 Jul 2026", reach: "4,218 delivered" },
    { title: "New creative specs for digital screens", status: { label: "Sent", tone: "success" as const }, date: "9 Jul 2026", reach: "1,872 delivered" },
    { title: "GST invoice format update", status: { label: "Scheduled", tone: "info" as const }, date: "5 Aug 2026", reach: "436 recipients" },
];

export function AnnouncementsView() {
    const [title, setTitle] = React.useState("Scheduled maintenance on Sunday 2 August");
    const [message, setMessage] = React.useState(
        "ADX will be unavailable from 1:00 AM to 4:00 AM IST while we upgrade the booking engine. Live campaigns continue to deliver."
    );
    const [audience, setAudience] = React.useState("All users");
    const [sendNow, setSendNow] = React.useState(false);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Announcements"
                subtitle="Broadcast product and policy updates to the marketplace"
            />

            <div className="grid gap-4 xl:grid-cols-2">
                {/* Compose */}
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Compose
                    </h3>
                    <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="ann-title">Title</Label>
                            <Input
                                id="ann-title"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ann-body">Message body</Label>
                            <Textarea
                                id="ann-body"
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                className="min-h-24 resize-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Audience</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {audiences.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setAudience(option)}
                                        className={cn(
                                            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                                            audience === option
                                                ? "border-foreground bg-foreground text-background"
                                                : "bg-card text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Channels</Label>
                            <div className="flex flex-wrap gap-4">
                                {[
                                    ["In-app banner", true],
                                    ["Email", true],
                                    ["Push", false],
                                ].map(([label, checked]) => (
                                    <label key={String(label)} className="flex items-center gap-2 text-sm">
                                        <Checkbox defaultChecked={Boolean(checked)} />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Priority</Label>
                                <Select defaultValue="normal">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="normal">Normal</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Expiry date</Label>
                                <Select defaultValue="09-aug">
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="09-aug">09 Aug 2026</SelectItem>
                                        <SelectItem value="16-aug">16 Aug 2026</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Schedule</Label>
                            <div className="flex gap-4 text-sm">
                                {[
                                    ["Send now", true],
                                    ["Schedule for later", false],
                                ].map(([label, isNow]) => (
                                    <label key={String(label)} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="ann-schedule"
                                            checked={sendNow === isNow}
                                            onChange={() => setSendNow(Boolean(isNow))}
                                            className="size-3.5 accent-[hsl(359.5_85.5%_29.8%)]"
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                            {!sendNow && (
                                <div className="grid grid-cols-2 gap-3">
                                    <Input defaultValue="02 Aug 2026" aria-label="Schedule date" />
                                    <Input defaultValue="00:30 IST" aria-label="Schedule time" />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end border-t pt-4">
                            <Button
                                onClick={() =>
                                    toast.success(
                                        sendNow ? "Announcement sent" : "Announcement scheduled",
                                        { description: `${audience} · in-app banner and email` }
                                    )
                                }
                            >
                                {sendNow ? "Send announcement" : "Schedule announcement"}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Preview + history */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            In-app banner preview
                        </h3>
                        <div className="mt-3 flex items-start gap-3 rounded-lg border border-info/20 bg-info-soft p-3.5">
                            <Megaphone className="mt-0.5 size-4 shrink-0 text-info" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">{title}</p>
                                <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                                    {message}
                                </p>
                            </div>
                            <button className="shrink-0 text-xs font-medium text-info underline-offset-4 hover:underline">
                                Learn more
                            </button>
                        </div>

                        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Push preview
                        </h3>
                        <div className="mt-3 rounded-lg border bg-canvas p-3.5">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="font-semibold uppercase">ADX</span>
                                <span>now</span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
                            <p className="line-clamp-1 text-xs text-muted-foreground">{message}</p>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Recent announcements
                        </h3>
                        <ul className="mt-3 divide-y">
                            {recent.map((item) => (
                                <li key={item.title} className="flex items-center gap-3 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.date} · {item.reach}
                                        </p>
                                    </div>
                                    <StatusBadge status={item.status} />
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}
