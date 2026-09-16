"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { needsReason, statusTargets, workService, type WorkTaskDetail } from "@/services/work";
import { WORK_TASK_STATUS_META, type WorkTaskStatus } from "@/types";

interface StatusMenuProps {
    taskId: string;
    status: WorkTaskStatus;
    /** After the server answered — the caller reloads what it drew. */
    onMoved: (task: WorkTaskDetail) => void;
    className?: string;
    /** Draws the badge with a chevron beside it; `sm` for a board card. */
    size?: "sm" | "md";
}

/**
 * The status rules as a text a person can act on: a 409 names the
 * unfinished prerequisites or says the task is under review, a 400 asks
 * for the reason — every one is the server's own sentence.
 */
export function statusErrorMessage(caught: unknown): string {
    if (caught instanceof ApiError) {
        const details = caught.details as { prerequisites?: { displayId: string | null; title: string }[] } | undefined;
        const named = details?.prerequisites?.map((row) => row.displayId ?? row.title).filter(Boolean);
        return named?.length ? `${caught.message}: ${named.join(", ")}` : caught.message;
    }
    return "Could not move the task. Check your connection and try again.";
}

/**
 * The status badge with a "Move task to" menu behind it — the moves the
 * module allows from here (`statusTargets`), a reason asked for when the
 * target is BLOCKED, and every refusal shown as the server said it.
 * VERIFIED is offered only to `work.approve`: a reviewer reaches it
 * through the review bar on the task's page.
 */
export function StatusMenu({ taskId, status, onMoved, className, size = "md" }: StatusMenuProps) {
    const { can } = useAuth();
    const targets = statusTargets(status, { edit: can("work.edit"), approve: can("work.approve") });
    const [pending, setPending] = React.useState<WorkTaskStatus | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const meta = WORK_TASK_STATUS_META[status];

    const move = async (next: WorkTaskStatus, why?: string) => {
        setBusy(true);
        try {
            const task = await workService.tasks.setStatus(taskId, next, why);
            toast.success(`Moved to ${WORK_TASK_STATUS_META[task.status].label}`, {
                description: task.status !== next ? `The server settled on ${WORK_TASK_STATUS_META[task.status].label.toLowerCase()} — a task with no reviewers verifies outright.` : undefined,
            });
            setPending(null);
            setReason("");
            onMoved(task);
        } catch (caught) {
            toast.error(statusErrorMessage(caught));
        } finally {
            setBusy(false);
        }
    };

    const pick = (next: WorkTaskStatus) => {
        if (needsReason(next)) {
            setReason("");
            setPending(next);
            return;
        }
        void move(next);
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`Status ${meta.label}, change status`}
                        disabled={busy || targets.length === 0}
                        onClick={(event) => event.stopPropagation()}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default disabled:hover:bg-transparent",
                            size === "sm" ? "px-1 py-0.5" : "-mr-1.5 px-1.5 py-1",
                            className,
                        )}
                    >
                        <StatusBadge status={meta} />
                        {targets.length > 0 && <ChevronDown className="size-3.5 text-muted-foreground" />}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Move task to</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {targets.map((option) => (
                        <DropdownMenuItem key={option} onSelect={() => pick(option)}>
                            {WORK_TASK_STATUS_META[option].label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
                <DialogContent className="sm:max-w-md" onClick={(event) => event.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>Block this task</DialogTitle>
                        <DialogDescription>The reason is kept on the task while it is blocked and recorded in its history.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5 py-1">
                        <Label htmlFor={`block-reason-${taskId}`}>Reason</Label>
                        <Textarea id={`block-reason-${taskId}`} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What is holding the task?" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="bg-card" onClick={() => setPending(null)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={() => pending && void move(pending, reason)} disabled={busy || !reason.trim()}>
                            Block task
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
