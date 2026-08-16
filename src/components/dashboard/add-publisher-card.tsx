"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

/** Dashboard quick form, invites a publisher with the KYC checklist. */
export function AddPublisherCard() {
    const [businessName, setBusinessName] = React.useState("");
    const [ownerEmail, setOwnerEmail] = React.useState("");
    const [businessType, setBusinessType] = React.useState("individual");
    const [note, setNote] = React.useState("");

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        toast.success(`Invite sent to ${ownerEmail}`, {
            description: `${businessName} will receive an activation link with the KYC checklist.`,
        });
        setBusinessName("");
        setOwnerEmail("");
        setNote("");
    };

    return (
        <Card className="flex flex-col rounded-lg border-border p-5 shadow-none">
            <div>
                <h2 className="text-base font-semibold text-foreground">Add a publisher</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    Sends an activation link with the KYC checklist
                </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-1 flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="qa-business">Business name</Label>
                        <Input
                            id="qa-business"
                            required
                            value={businessName}
                            onChange={(event) => setBusinessName(event.target.value)}
                            placeholder="e.g. Sharma Hoardings"
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="qa-email">Owner email</Label>
                        <Input
                            id="qa-email"
                            type="email"
                            required
                            value={ownerEmail}
                            onChange={(event) => setOwnerEmail(event.target.value)}
                            placeholder="owner@business.in"
                            className="h-9"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label>Business type</Label>
                    <Select value={businessType} onValueChange={setBusinessType}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="individual">Individual</SelectItem>
                            <SelectItem value="company">Company</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="qa-note">Note</Label>
                    <Input
                        id="qa-note"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Optional note for the activation email"
                        className="h-9"
                    />
                </div>

                <div className="mt-auto flex justify-end pt-1">
                    <Button type="submit">Send invite</Button>
                </div>
            </form>
        </Card>
    );
}
