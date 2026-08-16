"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Download, Film, Flag, Image as ImageIcon, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { CREATIVE_STATUS_META, type Creative } from "@/types";

interface CreativeDetailProps {
    creative: Creative;
    queue: Creative[];
}

const complianceChecklist = [
    { name: "Brand-safe imagery", detail: "No prohibited or unsafe content detected", auto: true },
    { name: "ASCI code compliance", detail: "Claims and disclaimers within code", auto: true },
    { name: "No competitor marks", detail: "Logo scan across frames", auto: false },
    { name: "Legible at viewing distance", detail: "Text height vs placement spec", auto: false },
    { name: "Dimensions match placement", detail: "Asset matches the booked slot spec", auto: true },
];

export function CreativeDetail({ creative, queue }: CreativeDetailProps) {
    const router = useRouter();
    const [zoom, setZoom] = React.useState(100);
    const [note, setNote] = React.useState("");

    const decide = (verdict: string) => {
        if (verdict === "Rejected" && !note.trim()) {
            toast.error("Add a review note before rejecting.");
            return;
        }
        toast.success(`${creative.campaign} ${verdict.toLowerCase()}`, {
            description: "The advertiser has been notified.",
        });
        router.push("/moderation");
    };

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/moderation"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Creative review
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {creative.campaign}
                    </h1>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Original asset downloading")}
                        >
                            <Download className="mr-1.5 size-4" />
                            Download original
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card text-danger hover:text-danger"
                            onClick={() => decide("Rejected")}
                        >
                            Reject
                        </Button>
                        <Button onClick={() => decide("Approved")}>Approve</Button>
                    </div>
                </div>
            </div>

            {/* Summary strip */}
            <Card className="rounded-lg border-border shadow-none">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
                    {[
                        ["Advertiser", creative.advertiser],
                        ["Campaign", creative.campaign],
                        ["Placement", creative.dimensions],
                        ["Format", creative.kind],
                        ["File size", creative.fileSize],
                        ["Submitted", creative.submittedAt],
                    ].map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {label}
                            </dt>
                            <dd className="mt-0.5 truncate text-sm font-medium text-foreground">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
            </Card>

            <div className="grid gap-4 xl:grid-cols-5">
                {/* Viewer */}
                <Card className="flex flex-col overflow-hidden rounded-lg border-border shadow-none xl:col-span-3">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <StatusBadge status={CREATIVE_STATUS_META[creative.status]} />
                            {creative.flags.map((flag) => (
                                <span
                                    key={flag}
                                    className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger"
                                >
                                    <Flag className="size-3" />
                                    {flag}
                                </span>
                            ))}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Zoom out"
                                onClick={() => setZoom((value) => Math.max(50, value - 25))}
                            >
                                <Minus className="size-3.5" />
                            </Button>
                            <span className="w-11 text-center text-xs text-muted-foreground">{zoom}%</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label="Zoom in"
                                onClick={() => setZoom((value) => Math.min(200, value + 25))}
                            >
                                <Plus className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/40 p-8">
                        <div
                            className="flex aspect-video w-full max-w-2xl items-center justify-center rounded-md border shadow-sm transition-transform"
                            style={{
                                transform: `scale(${zoom / 100})`,
                                background: `linear-gradient(140deg, hsl(${creative.previewHue} 28% 88%), hsl(${creative.previewHue} 22% 72%))`,
                            }}
                        >
                            <div className="text-center">
                                {creative.kind === "Video" ? (
                                    <Film className="mx-auto size-8 text-foreground/40" strokeWidth={1.5} />
                                ) : (
                                    <ImageIcon className="mx-auto size-8 text-foreground/40" strokeWidth={1.5} />
                                )}
                                <p className="mt-2 text-sm font-medium text-foreground">
                                    {creative.campaign}
                                </p>
                                <p className="mt-0.5 text-xs text-foreground/60">
                                    {creative.kind} · {creative.dimensions} · {creative.fileSize}
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Rail */}
                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Compliance checklist
                        </h3>
                        <ul className="mt-3 divide-y">
                            {complianceChecklist.map((check) => (
                                <li key={check.name} className="flex items-center gap-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground">{check.name}</p>
                                        <p className="text-xs text-muted-foreground">{check.detail}</p>
                                    </div>
                                    {check.auto ? (
                                        <StatusBadge status={{ label: "Pass", tone: "success" }} />
                                    ) : (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => toast.success(`${check.name} approved`)}
                                            >
                                                <Check className="mr-1 size-3" />
                                                Approve
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs text-warning hover:text-warning"
                                                onClick={() => toast.info(`${check.name} flagged`)}
                                            >
                                                <Flag className="mr-1 size-3" />
                                                Flag
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Review note
                        </h3>
                        <Textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Add a note for the advertiser and the audit trail"
                            className="mt-3 min-h-20 resize-none"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            A note is required when rejecting or requesting changes.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8 bg-card"
                            onClick={() => {
                                if (!note.trim()) {
                                    toast.error("Write the requested changes first.");
                                    return;
                                }
                                toast.success("Changes requested from the advertiser");
                                setNote("");
                            }}
                        >
                            Request changes
                        </Button>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Creative queue
                        </h3>
                        <ul className="mt-2 divide-y">
                            {queue.map((item) => (
                                <li key={item.id}>
                                    <Link
                                        href={`/moderation/${item.id}`}
                                        className={cn(
                                            "flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-foreground",
                                            item.id === creative.id
                                                ? "text-foreground"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        <span className="min-w-0">
                                            <span
                                                className={cn(
                                                    "block truncate text-sm",
                                                    item.id === creative.id && "font-semibold"
                                                )}
                                            >
                                                {item.campaign}
                                            </span>
                                            <span className="block text-xs">{item.advertiser}</span>
                                        </span>
                                        <span className="shrink-0 text-xs">{item.submittedAt}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}
