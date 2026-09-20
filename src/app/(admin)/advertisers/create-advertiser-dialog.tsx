"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isLive } from "@/lib/api-config";
import { AdvertiserOnboardingForm } from "./advertiser-onboarding-form";

interface CreateAdvertiserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Re-read the list once the account is opened. */
    onCreated: () => void;
}

/**
 * Onboarding an advertiser from the desk — QR-15.
 *
 * `POST /advertisers { onBehalf: true }` is the door the field app uses to
 * open an account for somebody who has not signed in yet; for an ADMIN it
 * is the same door with no agent attributed. Since QR-15 the desk takes
 * everything the app's own flow collects before the first booking (the
 * person, the account type, the billing address) and the server opens the
 * sign-in account with the number and the ADVERTISER role up front — so
 * the owner's first sign-in is OTP → platform terms → home, with the
 * profile gate already answered. KYC, the agreement and the funds stay
 * theirs to do. The ADV identifier is minted server-side.
 */
export function CreateAdvertiserDialog({ open, onOpenChange, onCreated }: CreateAdvertiserDialogProps) {
    const router = useRouter();
    const live = isLive("advertisers");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Onboard an advertiser</DialogTitle>
                    <DialogDescription>
                        Everything the app would ask, asked here. The account is opened with the number you enter; they sign in with it, agree to the platform terms and carry on — KYC, the agreement and topping up stay theirs to do.
                    </DialogDescription>
                </DialogHeader>

                {!live ? (
                    <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        The console is not connected to the ADX backend, so no account can be opened from here right now.
                    </p>
                ) : open ? (
                    <AdvertiserOnboardingForm
                        mode="create"
                        onCreated={(advertiser) => {
                            onOpenChange(false);
                            onCreated();
                            router.push(`/advertisers/${advertiser.id}`);
                        }}
                        onCancel={() => onOpenChange(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
