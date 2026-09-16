"use client";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    /** Optional extra body content between description and footer. */
    children?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    /** Blocks the action while an async confirm is in flight. */
    busy?: boolean;
    /** Blocks it because the body is incomplete — an unpicked target, say. */
    disabled?: boolean;
    onConfirm: () => void;
}

/** Confirmation modal per the "Admin · Confirmation modal" wireframe. */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    busy = false,
    disabled = false,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                {children}
                <AlertDialogFooter>
                    <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        className={cn(
                            destructive && buttonVariants({ variant: "destructive" })
                        )}
                        disabled={busy || disabled}
                        onClick={onConfirm}
                    >
                        {busy ? "Working…" : confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
