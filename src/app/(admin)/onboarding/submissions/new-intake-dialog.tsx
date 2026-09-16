"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { onboardingService, type NewIntakeInput, type WireIntakeSubmission } from "@/services/onboarding";

interface NewIntakeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialType: "AGENT" | "EMPLOYEE";
    onCreated: (submission: WireIntakeSubmission) => void;
}

/**
 * The desk typing an intake up — `POST /onboarding/submissions`, the user
 * provisioned inline in the same transaction. An agent intake needs the
 * side it works; an employee intake carries the HR row's two fields and
 * whether to invite them to the console on approval. Approval is a
 * separate step, on the record.
 */
export function NewIntakeDialog({ open, onOpenChange, initialType, onCreated }: NewIntakeDialogProps) {
    const [userType, setUserType] = React.useState<"AGENT" | "EMPLOYEE">(initialType);
    const [name, setName] = React.useState("");
    const [mobile, setMobile] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [side, setSide] = React.useState<"PUBLISHER" | "ADVERTISER" | "">("");
    const [city, setCity] = React.useState("");
    const [department, setDepartment] = React.useState("");
    const [designation, setDesignation] = React.useState("");
    const [invite, setInvite] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

    const ready = name.trim().length > 0 && mobile.trim().length >= 10 && (userType === "EMPLOYEE" || side !== "");

    const reset = () => {
        setName("");
        setMobile("");
        setEmail("");
        setSide("");
        setCity("");
        setDepartment("");
        setDesignation("");
        setInvite(false);
        setError(null);
        setFieldErrors({});
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const input: NewIntakeInput =
                userType === "AGENT"
                    ? { userType, name, mobile, email, side: side || undefined, city }
                    : { userType, name, mobile, email, department, designation, inviteToConsole: invite };
            const created = await onboardingService.create(input);
            toast.success(`${name.trim()} submitted for intake`, { description: "Approve the record to bring them into being." });
            reset();
            onOpenChange(false);
            onCreated(created);
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setError(cause.message);
            } else {
                setError(cause instanceof Error ? cause.message : "The intake did not reach ADX.");
            }
        } finally {
            setBusy(false);
        }
    };

    const fieldError = (key: string) => fieldErrors[key]?.[0];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New intake</DialogTitle>
                    <DialogDescription>
                        The person is provisioned with the record. Approving it afterwards creates the profile — an agent through the one door agents have, an employee as an HR row.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="intake-type">Who is this</Label>
                        <Select value={userType} onValueChange={(value) => setUserType(value as "AGENT" | "EMPLOYEE")}>
                            <SelectTrigger id="intake-type" className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AGENT">An agent</SelectItem>
                                <SelectItem value="EMPLOYEE">An employee</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="intake-name">Name</Label>
                            <Input id="intake-name" value={name} onChange={(event) => setName(event.target.value)} className="h-9" required />
                            {fieldError("user.name") && <p className="text-xs text-danger">{fieldError("user.name")}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="intake-mobile">Mobile</Label>
                            <Input id="intake-mobile" type="tel" inputMode="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} className="h-9" placeholder="+91…" required />
                            {fieldError("user.mobile") && <p className="text-xs text-danger">{fieldError("user.mobile")}</p>}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="intake-email">
                            Email <span className="font-normal text-muted-foreground">(optional{userType === "EMPLOYEE" ? " — needed for a console invitation" : ""})</span>
                        </Label>
                        <Input id="intake-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-9" />
                        {fieldError("user.email") && <p className="text-xs text-danger">{fieldError("user.email")}</p>}
                    </div>

                    {userType === "AGENT" ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="intake-side">Works with</Label>
                                <Select value={side} onValueChange={(value) => setSide(value as "PUBLISHER" | "ADVERTISER")}>
                                    <SelectTrigger id="intake-side" className="h-9">
                                        <SelectValue placeholder="Choose a side" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PUBLISHER">Publishers</SelectItem>
                                        <SelectItem value="ADVERTISER">Advertisers</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="intake-city">City</Label>
                                <Input id="intake-city" value={city} onChange={(event) => setCity(event.target.value)} className="h-9" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="intake-department">Department</Label>
                                    <Input id="intake-department" value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="intake-designation">Designation</Label>
                                    <Input id="intake-designation" value={designation} onChange={(event) => setDesignation(event.target.value)} className="h-9" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <Checkbox id="intake-invite" checked={invite} onCheckedChange={(value) => setInvite(value === true)} />
                                <Label htmlFor="intake-invite" className="cursor-pointer font-normal">
                                    Invite them to the console when approved
                                </Label>
                            </div>
                        </>
                    )}

                    {error && (
                        <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                            {error}
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? "Submitting…" : "Submit intake"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
