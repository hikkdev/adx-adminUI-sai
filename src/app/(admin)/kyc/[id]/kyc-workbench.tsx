"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, FileText, Flag, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import type { KycCase } from "@/types";

interface KycWorkbenchProps {
    kycCase: KycCase;
}

const checkTone = { pass: "success", fail: "danger", manual: "warning" } as const;
const checkLabel = { pass: "Pass", fail: "Fail", manual: "Manual" } as const;

export function KycWorkbench({ kycCase }: KycWorkbenchProps) {
    const router = useRouter();
    const [activeDoc, setActiveDoc] = React.useState(kycCase.documents[0]?.id);
    const [zoom, setZoom] = React.useState(100);
    const [note, setNote] = React.useState("");
    const [confirmAction, setConfirmAction] = React.useState<"approve" | "reject" | null>(null);

    const currentDoc = kycCase.documents.find((doc) => doc.id === activeDoc);
    const noteRequired = confirmActionNeedsNote(kycCase) && note.trim().length === 0;

    function confirmActionNeedsNote(target: KycCase) {
        return target.riskFlags.length > 0;
    }

    const finalize = (action: "approve" | "reject") => {
        toast.success(
            action === "approve"
                ? `${kycCase.applicant} approved and verified`
                : `${kycCase.applicant} rejected`,
            { description: note.trim() ? `Note recorded: “${note.trim()}”` : undefined }
        );
        router.push("/kyc");
    };

    const panCheck = kycCase.checks.find((check) => check.label.includes("PAN"));
    const summary: [string, string][] = [
        ["Business", kycCase.applicant],
        ["Owner", kycCase.owner],
        ["PAN", panCheck && panCheck.result === "pass" ? panCheck.detail : "-"],
        ["GSTIN", kycCase.checks.find((check) => check.label === "GSTIN")?.detail ?? "-"],
        ["Region", kycCase.city],
        ["Submitted", kycCase.submittedAt],
    ];

    return (
        <div className="space-y-5">
            <div>
                <Link
                    href="/kyc"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    KYC queue
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            KYC review
                        </p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                            {kycCase.applicant}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            className="bg-card text-danger hover:text-danger"
                            onClick={() => setConfirmAction("reject")}
                        >
                            Reject KYC
                        </Button>
                        <Button onClick={() => setConfirmAction("approve")}>
                            Approve &amp; verify
                        </Button>
                    </div>
                </div>
            </div>

            <Card className="rounded-lg border-border shadow-none">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
                    {summary.map(([label, value]) => (
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
                {/* Document viewer */}
                <Card className="flex flex-col rounded-lg border-border shadow-none xl:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {kycCase.documents.map((doc) => (
                                <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => setActiveDoc(doc.id)}
                                    className={cn(
                                        "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                                        doc.id === activeDoc
                                            ? "bg-foreground text-background"
                                            : "text-muted-foreground hover:bg-muted"
                                    )}
                                >
                                    <FileText className="size-3.5" />
                                    {doc.fileName}
                                </button>
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
                    <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/40 p-6">
                        <div
                            className="flex aspect-[3/2] w-full max-w-xl items-center justify-center rounded-md border bg-card shadow-sm transition-transform"
                            style={{ transform: `scale(${zoom / 100})` }}
                        >
                            <div className="text-center">
                                <FileText className="mx-auto size-8 text-muted-foreground/50" strokeWidth={1.5} />
                                <p className="mt-2 text-sm font-medium text-foreground">
                                    {currentDoc?.fileName}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {currentDoc?.type} · uploaded {currentDoc?.uploadedAt} · •••• ••••
                                    9012
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Checks + notes */}
                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Verification checks
                        </h3>
                        <ul className="mt-3 divide-y">
                            {kycCase.checks.map((check) => (
                                <li key={check.label} className="flex items-center gap-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground">{check.label}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {check.detail}
                                        </p>
                                    </div>
                                    {check.result === "manual" ? (
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => toast.success(`${check.label} approved`)}
                                            >
                                                <Check className="mr-1 size-3" />
                                                Approve
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs text-warning hover:text-warning"
                                                onClick={() => toast.info(`${check.label} flagged for a second look`)}
                                            >
                                                <Flag className="mr-1 size-3" />
                                                Flag
                                            </Button>
                                        </div>
                                    ) : (
                                        <StatusBadge
                                            status={{
                                                label: checkLabel[check.result],
                                                tone: checkTone[check.result],
                                            }}
                                        />
                                    )}
                                </li>
                            ))}
                        </ul>
                        {kycCase.riskFlags.length > 0 && (
                            <div className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                                {kycCase.riskFlags.join(" · ")}
                            </div>
                        )}
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Reviewer notes
                        </h3>
                        <Textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Add a note for the audit trail…"
                            className="mt-3 min-h-24 resize-none"
                        />
                        <p className="mt-2 text-xs text-muted-foreground">
                            A note is required when rejecting or when risk flags are present.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8"
                            onClick={() =>
                                toast.success("Re-upload requested", {
                                    description: `${kycCase.applicant} will be asked for fresh documents.`,
                                })
                            }
                        >
                            Request re-upload
                        </Button>
                    </Card>
                </div>
            </div>

            <ConfirmDialog
                open={confirmAction !== null}
                onOpenChange={(open) => !open && setConfirmAction(null)}
                title={confirmAction === "approve" ? "Approve and verify?" : "Reject this application?"}
                description={
                    confirmAction === "approve"
                        ? `${kycCase.applicant} will be marked verified and payouts will unlock immediately.`
                        : `${kycCase.applicant} will be notified with your reviewer note. They can resubmit corrected documents.`
                }
                confirmLabel={confirmAction === "approve" ? "Approve & verify" : "Reject KYC"}
                destructive={confirmAction === "reject"}
                onConfirm={() => {
                    if (confirmAction === "reject" && note.trim().length === 0) {
                        toast.error("Add a reviewer note before rejecting.");
                        setConfirmAction(null);
                        return;
                    }
                    if (confirmAction === "approve" && noteRequired) {
                        toast.error("Risk flags present, add a reviewer note first.");
                        setConfirmAction(null);
                        return;
                    }
                    finalize(confirmAction!);
                }}
            />
        </div>
    );
}
