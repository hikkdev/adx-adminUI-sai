"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, Minus, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR, formatNumber } from "@/lib/format";
import {
    MILESTONE_STATUS_META,
    type Milestone,
    type MilestoneAudience,
} from "@/types";

interface MilestoneEditorProps {
    milestones: Milestone[];
    activeId: string;
}

const audiences: MilestoneAudience[] = ["Publisher agents", "Advertiser agents", "Both"];

export function MilestoneEditor({ milestones, activeId }: MilestoneEditorProps) {
    const source = milestones.find((milestone) => milestone.id === activeId) ?? milestones[0];
    const [draft, setDraft] = React.useState<Milestone>(source);
    const [dirty, setDirty] = React.useState(false);

    const update = <K extends keyof Milestone>(key: K, value: Milestone[K]) => {
        setDraft((current) => ({ ...current, [key]: value }));
        setDirty(true);
    };

    const progressPreview = Math.min(
        100,
        Math.round((draft.completed / Math.max(draft.enrolled, 1)) * 100) || 40
    );

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/growth"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Growth CMS
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Milestone program
                    </h1>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card"
                            disabled={!dirty}
                            onClick={() => {
                                setDraft(source);
                                setDirty(false);
                            }}
                        >
                            Discard
                        </Button>
                        <Button
                            disabled={!dirty}
                            onClick={() => {
                                setDirty(false);
                                toast.success("Milestone published", {
                                    description: `${draft.title} is now visible to ${draft.audience.toLowerCase()}.`,
                                });
                            }}
                        >
                            Publish changes
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
                {/* Milestone list rail */}
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                    <h3 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Milestones
                    </h3>
                    <ul className="divide-y">
                        {milestones.map((milestone) => {
                            const active = milestone.id === draft.id;
                            return (
                                <li key={milestone.id}>
                                    <Link
                                        href={`/growth/${milestone.id}`}
                                        className={cn(
                                            "block px-4 py-3 transition-colors",
                                            active ? "bg-primary/[0.04]" : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {milestone.title}
                                            </p>
                                            <StatusBadge
                                                status={MILESTONE_STATUS_META[milestone.status]}
                                            />
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {milestone.note ??
                                                `${formatNumber(milestone.enrolled)} agents enrolled`}
                                        </p>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </Card>

                {/* Form */}
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Milestone details
                    </h3>
                    <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="ms-title">Title</Label>
                            <Input
                                id="ms-title"
                                value={draft.title}
                                onChange={(event) => update("title", event.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ms-desc">Description</Label>
                            <Textarea
                                id="ms-desc"
                                value={draft.description}
                                onChange={(event) => update("description", event.target.value)}
                                className="min-h-20 resize-none"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Target count</Label>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-9 shrink-0"
                                        aria-label="Decrease target"
                                        onClick={() =>
                                            update("targetCount", Math.max(1, draft.targetCount - 1))
                                        }
                                    >
                                        <Minus className="size-4" />
                                    </Button>
                                    <Input
                                        value={draft.targetCount}
                                        onChange={(event) =>
                                            update("targetCount", Number(event.target.value) || 1)
                                        }
                                        inputMode="numeric"
                                        className="text-center"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-9 shrink-0"
                                        aria-label="Increase target"
                                        onClick={() => update("targetCount", draft.targetCount + 1)}
                                    >
                                        <Plus className="size-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ms-reward">Reward (₹)</Label>
                                <Input
                                    id="ms-reward"
                                    value={draft.rewardInr}
                                    inputMode="numeric"
                                    onChange={(event) =>
                                        update("rewardInr", Number(event.target.value) || 0)
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Duration</Label>
                                <Select
                                    value={String(draft.durationDays)}
                                    onValueChange={(value) => update("durationDays", Number(value))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[30, 45, 60, 90].map((days) => (
                                            <SelectItem key={days} value={String(days)}>
                                                {days} days
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ms-event">Target event</Label>
                                <Input
                                    id="ms-event"
                                    value={draft.targetEvent}
                                    onChange={(event) => update("targetEvent", event.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Applies to</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {audiences.map((audience) => (
                                    <button
                                        key={audience}
                                        type="button"
                                        onClick={() => update("audience", audience)}
                                        className={cn(
                                            "h-9 rounded-lg border px-3 text-sm font-medium transition-colors",
                                            draft.audience === audience
                                                ? "border-foreground bg-foreground text-background"
                                                : "bg-card text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {audience}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3 border-t pt-4">
                            <label className="flex items-center justify-between gap-4">
                                <span>
                                    <span className="block text-sm font-medium text-foreground">
                                        Auto-enroll new agents
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        New agents see this milestone on day one
                                    </span>
                                </span>
                                <Switch
                                    checked={draft.autoEnroll}
                                    onCheckedChange={(value) => update("autoEnroll", value)}
                                />
                            </label>
                            <label className="flex items-center justify-between gap-4">
                                <span>
                                    <span className="block text-sm font-medium text-foreground">
                                        Push notification on unlock
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        Celebrate completion in the field app
                                    </span>
                                </span>
                                <Switch
                                    checked={draft.pushOnUnlock}
                                    onCheckedChange={(value) => update("pushOnUnlock", value)}
                                />
                            </label>
                        </div>
                    </div>
                </Card>

                {/* Agent preview */}
                <div className="xl:col-span-3">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Agent experience preview
                        </h3>
                        <div className="mt-4 rounded-lg border bg-canvas p-4">
                            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                <Sparkles className="size-3" />
                                Milestone
                            </p>
                            <p className="mt-2 text-sm font-semibold text-foreground">{draft.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{draft.description}</p>
                            <Progress value={progressPreview} className="mt-4 h-1.5" />
                            <div className="mt-2 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                    {Math.round((progressPreview / 100) * draft.targetCount)} of{" "}
                                    {draft.targetCount}
                                </span>
                                <span className="font-medium text-foreground">{progressPreview}%</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-center">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        Reward
                                    </p>
                                    <p className="text-sm font-semibold text-foreground">
                                        {formatINR(draft.rewardInr)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        Window
                                    </p>
                                    <p className="text-sm font-semibold text-foreground">
                                        {draft.durationDays} days
                                    </p>
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            This is how the milestone card renders in the ADX agent app.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}
