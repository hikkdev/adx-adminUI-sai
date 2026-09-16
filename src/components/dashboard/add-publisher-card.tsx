"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AddPublisherForm, CreatedState } from "@/components/adx/add-publisher-form";
import { isLive } from "@/lib/api-config";
import type { CreatedPublisher } from "@/services/publishers";

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
    const [created, setCreated] = React.useState<CreatedPublisher | null>(null);

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Add a publisher</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Opens the account now; the owner claims it by signing in with their number
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
            ) : created ? (
                <CreatedState publisher={created} onAnother={() => setCreated(null)} />
            ) : (
                <AddPublisherForm onCreated={setCreated} />
            )}
        </Card>
    );
}
