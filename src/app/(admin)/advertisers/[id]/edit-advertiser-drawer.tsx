"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import type { Advertiser } from "@/types";
import { AdvertiserOnboardingForm, advertiserValuesOf } from "../advertiser-onboarding-form";

/**
 * QR-15 — "Edit details" on the advertiser page: the same form the desk
 * onboards with, prefilled from the row and the person behind it, saved
 * with `PATCH /advertisers/:id`. Needs `demand.edit` (advertisers are the
 * demand side of the permission groups); without it the button is not
 * drawn. An advertiser with no account yet who is given a first name here
 * gets one opened and linked, the way a fresh onboarding does.
 */
export function EditAdvertiserDrawer({ advertiser, onChanged }: { advertiser: Advertiser; onChanged: () => void }) {
    const { can } = useAuth();
    const [open, setOpen] = React.useState(false);
    if (!can("demand.edit")) return null;
    return (
        <>
            <Button variant="outline" className="bg-card" onClick={() => setOpen(true)} data-testid="advertiser-edit-open">
                <Pencil className="mr-1.5 size-4" aria-hidden />
                Edit details
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="advertiser-edit-drawer">
                    <SheetHeader>
                        <SheetTitle>Edit details</SheetTitle>
                        <SheetDescription>
                            Everything the app collects before the first booking, editable here. The advertiser sees the change the next time they open the app; nothing is asked of them again.
                        </SheetDescription>
                    </SheetHeader>
                    {open ? (
                        <AdvertiserOnboardingForm
                            mode="edit"
                            advertiserId={advertiser.id}
                            initial={advertiserValuesOf(advertiser)}
                            onSaved={() => {
                                setOpen(false);
                                onChanged();
                            }}
                            onCancel={() => setOpen(false)}
                        />
                    ) : null}
                </SheetContent>
            </Sheet>
        </>
    );
}
