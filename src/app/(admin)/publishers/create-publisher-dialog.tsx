"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AddPublisherForm, CreatedState } from "@/components/adx/add-publisher-form";
import { isLive } from "@/lib/api-config";
import type { CreatedPublisher } from "@/services/publishers";

interface CreatePublisherDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * "Add publisher" — the Figma create wireframe's modal, over the honest
 * form the dashboard card already had (Lot A): `POST /publishers`, the
 * number required, no activation link promised because none is sent. The
 * owner claims the account by signing in with their number; the publisher
 * lands on the roster the moment the API answers.
 */
export function CreatePublisherDialog({ open, onOpenChange }: CreatePublisherDialogProps) {
    const live = isLive("supply");
    const [created, setCreated] = React.useState<CreatedPublisher | null>(null);

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) setCreated(null);
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Add publisher</DialogTitle>
                    <DialogDescription>
                        Opens the account now; the owner claims it by signing in with their number.
                    </DialogDescription>
                </DialogHeader>
                {!live ? (
                    <div className="flex items-start gap-3 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                        <PlugZap className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <p>
                            Publishers are opened on the API. Set <code className="font-mono text-xs">NEXT_PUBLIC_USE_API=true</code> and
                            point the console at the ADX backend to use this dialog.
                        </p>
                    </div>
                ) : created ? (
                    <CreatedState publisher={created} onAnother={() => setCreated(null)} />
                ) : (
                    <AddPublisherForm onCreated={setCreated} />
                )}
            </DialogContent>
        </Dialog>
    );
}
