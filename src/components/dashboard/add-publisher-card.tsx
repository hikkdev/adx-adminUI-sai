"use client";

import * as React from "react";
import { PlugZap, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreatePublisherDialog } from "@/app/(admin)/publishers/create-publisher-dialog";
import { isLive } from "@/lib/api-config";

/**
 * The dashboard's "Add a publisher" card — `POST /publishers` from the desk.
 *
 * The frame's layout is kept: title and one-line subtitle, a two-column row,
 * a select, one more field, the button bottom-right. The copy is not. It
 * promised an activation link with a KYC checklist emailed to an owner, and
 * nothing sends one — a publisher's identity is their mobile, and the owner
 * claims the account by signing in with that number. So the fields are the
 * schema's, the number is required, the email is not, and the success state
 * says what actually happens next.
 *
 * "Attribute to agent" is Q29: an admin's publisher goes on nobody's book
 * unless the admin names an agent, and the picker searches `GET /agents`
 * rather than holding the roster.
 */
export function AddPublisherCard() {
    const live = isLive("supply");
    // QR-13: the card opens the full onboarding — the desk collects what the app's ladder does, so the owner is never asked twice.
    const [open, setOpen] = React.useState(false);

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Onboard a publisher</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Everything the app&apos;s onboarding asks, entered here; the owner signs in, agrees to the terms, and carries on
                </p>
            </div>

            {!live ? (
                <div className="mt-4 flex flex-1 items-start gap-3 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    <PlugZap className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p>
                        Publishers are opened on the API. Set <code className="font-mono text-xs">NEXT_PUBLIC_USE_API=true</code>{" "}
                        and point the console at the ADX backend to use this card.
                    </p>
                </div>
            ) : (
                <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                    <ul className="space-y-1 text-sm text-muted-foreground">
                        <li>1 · Account type</li>
                        <li>2 · The person — name, number, email, date of birth</li>
                        <li>3 · The address, off the map, with its pin</li>
                        <li>4 · Business and contact person, for a business or organisation</li>
                    </ul>
                    <div className="flex justify-end">
                        <Button onClick={() => setOpen(true)} data-testid="dashboard-onboard-publisher">
                            <UserPlus className="mr-1.5 size-4" aria-hidden />
                            Onboard a publisher
                        </Button>
                    </div>
                    <CreatePublisherDialog open={open} onOpenChange={setOpen} />
                </div>
            )}
        </Card>
    );
}
