"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Film, Flag, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import type { Creative } from "@/types";

interface ModerationViewProps {
    creatives: Creative[];
}

type ChipValue = "all" | "flagged" | "static" | "video" | "resubmitted";

export function ModerationView({ creatives }: ModerationViewProps) {
    const router = useRouter();
    const [chip, setChip] = React.useState<ChipValue>("all");
    const [selected, setSelected] = React.useState<Set<string>>(new Set());

    const matches = (creative: Creative) => {
        switch (chip) {
            case "flagged":
                return creative.status === "flagged";
            case "resubmitted":
                return creative.status === "resubmitted";
            case "static":
                return creative.kind === "Static";
            case "video":
                return creative.kind === "Video";
            default:
                return true;
        }
    };

    const visible = creatives.filter(matches);

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

    const act = (verb: string, ids: string[]) => {
        toast.success(`${verb} ${ids.length} creative${ids.length === 1 ? "" : "s"}`);
        setSelected(new Set());
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Creative review"
                subtitle={`${creatives.filter((creative) => creative.status !== "approved").length} creatives awaiting review before campaigns go live.`}
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card text-danger hover:text-danger"
                            disabled={selected.size === 0}
                            onClick={() => act("Rejected", [...selected])}
                        >
                            Reject selected
                        </Button>
                        <Button
                            disabled={selected.size === 0}
                            onClick={() => act("Approved", [...selected])}
                        >
                            Approve selected{selected.size > 0 ? ` (${selected.size})` : ""}
                        </Button>
                    </>
                }
            />

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: creatives.length },
                    {
                        value: "flagged",
                        label: "Flagged",
                        count: creatives.filter((creative) => creative.status === "flagged").length,
                    },
                    {
                        value: "static",
                        label: "Static",
                        count: creatives.filter((creative) => creative.kind === "Static").length,
                    },
                    {
                        value: "video",
                        label: "Video",
                        count: creatives.filter((creative) => creative.kind === "Video").length,
                    },
                    {
                        value: "resubmitted",
                        label: "Resubmitted",
                        count: creatives.filter((creative) => creative.status === "resubmitted").length,
                    },
                ]}
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {visible.map((creative) => {
                    const isSelected = selected.has(creative.id);
                    const flagged = creative.status === "flagged";
                    return (
                        <Card
                            key={creative.id}
                            className={cn(
                                "overflow-hidden rounded-lg border-border shadow-none transition-shadow",
                                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-canvas"
                            )}
                        >
                            <div
                                className="relative flex aspect-[16/10] items-end p-3"
                                style={{
                                    background: `linear-gradient(140deg, hsl(${creative.previewHue} 28% 88%), hsl(${creative.previewHue} 22% 72%))`,
                                }}
                            >
                                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                                    <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                        {creative.kind === "Video" ? (
                                            <Film className="size-3" />
                                        ) : (
                                            <ImageIcon className="size-3" />
                                        )}
                                        {creative.kind}
                                    </span>
                                    {flagged && (
                                        <span className="flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                            <Flag className="size-3" />
                                            Flagged
                                        </span>
                                    )}
                                </div>
                                <div className="absolute right-3 top-3">
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggle(creative.id)}
                                        aria-label={`Select ${creative.campaign}`}
                                        className="bg-white/80"
                                    />
                                </div>
                                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white">
                                    {creative.fileSize}
                                </span>
                            </div>

                            <div className="p-4">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {creative.advertiser}
                                </p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                                    {creative.campaign}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {creative.dimensions} · Submitted {creative.submittedAt}
                                </p>
                                {creative.flags.length > 0 && (
                                    <p className="mt-2 rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">
                                        {creative.flags[0]}
                                    </p>
                                )}
                                <div className="mt-3 flex items-center gap-1.5">
                                    <Button
                                        size="sm"
                                        className="h-8 flex-1"
                                        onClick={() => act("Approved", [creative.id])}
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 flex-1 text-danger hover:text-danger"
                                        onClick={() => act("Rejected", [creative.id])}
                                    >
                                        Reject
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="size-8 shrink-0"
                                        aria-label="Review creative"
                                        onClick={() => router.push(`/moderation/${creative.id}`)}
                                    >
                                        <Eye className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {selected.size > 0 && (
                <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 shadow-lg">
                    <span className="text-sm font-medium">{selected.size} selected</span>
                    <button
                        type="button"
                        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                        onClick={() => setSelected(new Set())}
                    >
                        Clear
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" className="h-8" onClick={() => act("Approved", [...selected])}>
                            Approve {selected.size} creative{selected.size === 1 ? "" : "s"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-danger hover:text-danger"
                            onClick={() => act("Rejected", [...selected])}
                        >
                            Reject
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
