"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PublisherOnboardingForm, valuesOf } from "@/components/adx/publisher-onboarding-form";
import { useAuth } from "@/lib/auth";
import type { Publisher } from "@/types";

/**
 * QR-13 — "Edit details" on the party page: the same form the desk
 * onboards with, prefilled from the row and the person behind it, saved
 * with `PATCH /publishers/:id`. Needs `supply.edit` (publishers are the
 * supply side of the permission groups); without it the
 * button is not drawn. A publisher with no account yet who is given a
 * first name here gets one opened and linked, the way a fresh onboarding
 * does.
 */
export function EditPublisherDrawer({ publisher, onChanged }: { publisher: Publisher; onChanged: () => void }) {
    const { can } = useAuth();
    const [open, setOpen] = React.useState(false);
    if (!can("supply.edit")) return null;
    return (
        <>
            <Button variant="outline" className="bg-card" onClick={() => setOpen(true)} data-testid="publisher-edit-open">
                <Pencil className="mr-1.5 size-4" aria-hidden />
                Edit details
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="publisher-edit-drawer">
                    <SheetHeader>
                        <SheetTitle>Edit details</SheetTitle>
                        <SheetDescription>
                            Everything the app&apos;s onboarding collects, editable here. The publisher sees the change the next time they open the app; nothing is asked of them again.
                        </SheetDescription>
                    </SheetHeader>
                    {open ? (
                        <PublisherOnboardingForm
                            mode="edit"
                            publisherId={publisher.id}
                            initial={valuesOf(publisher)}
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
