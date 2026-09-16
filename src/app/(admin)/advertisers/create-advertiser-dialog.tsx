"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/adx/city-combobox";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { advertiserService, type CreateAdvertiserInput } from "@/services/advertisers";
import { ADVERTISER_TYPE_LABELS, type AdvertiserType } from "@/types";
import { IndustryPicker } from "./industry-picker";

interface CreateAdvertiserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a successful create, so the list behind the dialog refetches. */
    onCreated: () => void;
}

const EMPTY = { name: "", mobile: "", email: "", companyName: "", city: "", state: "" };
const TYPES = Object.keys(ADVERTISER_TYPE_LABELS) as AdvertiserType[];
/** What `registerAdvertiserSchema` accepts as a mobile: ten digits, 6–9 first. */
const MOBILE = /^[6-9]\d{9}$/;

/**
 * Opening an advertiser account from the desk.
 *
 * `POST /advertisers { onBehalf: true }` is the door the field app uses to
 * open an account for somebody who has not signed in yet; for an ADMIN it
 * is the same door with no agent attributed. The account is held under the
 * number typed here and linked the moment its owner signs in with it — the
 * unified onboarding still runs on their side; this only opens the wallet
 * and the profile ahead of them. The form asks for exactly what the schema
 * takes — since Lot G (Q119) the industry too, one of the picklist — and
 * the ADV identifier is minted server-side.
 */
export function CreateAdvertiserDialog({ open, onOpenChange, onCreated }: CreateAdvertiserDialogProps) {
    const router = useRouter();
    const live = isLive("advertisers");

    const [fields, setFields] = React.useState(EMPTY);
    const [type, setType] = React.useState<AdvertiserType>("COMMERCIAL");
    const [industry, setIndustry] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
        setFields((current) => ({ ...current, [key]: event.target.value }));

    // Ten digits with whatever people type between groups stripped; the
    // schema takes the bare number, not +91.
    const mobile = fields.mobile.replace(/[\s-]+/g, "").replace(/^\+?91(?=\d{10}$)/, "");
    const ready = fields.name.trim().length >= 2 && MOBILE.test(mobile);

    function reset() {
        setFields(EMPTY);
        setType("COMMERCIAL");
        setIndustry("");
        setFieldErrors({});
        setFormError(null);
    }

    function handleOpenChange(next: boolean) {
        if (!next) reset();
        onOpenChange(next);
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;

        // Optional fields go on the wire only when filled: the schema's
        // `email()` and `min(2)` would refuse an empty string.
        const input: CreateAdvertiserInput = {
            name: fields.name.trim(),
            mobile,
            type,
            ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
            ...(fields.companyName.trim() ? { companyName: fields.companyName.trim() } : {}),
            ...(industry ? { industry } : {}),
            ...(fields.city.trim() ? { city: fields.city.trim() } : {}),
            ...(fields.state.trim() ? { state: fields.state.trim() } : {}),
        };

        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const advertiser = await advertiserService.create(input);
            toast.success(`${advertiser.name} has an account${advertiser.displayId ? ` — ${advertiser.displayId}` : ""}`, {
                description: `Held for them until they sign in with ${mobile}.`,
            });
            reset();
            onOpenChange(false);
            onCreated();
            router.push(`/advertisers/${advertiser.id}`);
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not open the account.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Add an advertiser</DialogTitle>
                        <DialogDescription>
                            Opens the account and its wallet ahead of the owner. They sign in with the number you
                            enter and pick it up from there — KYC, the platform agreement and everything after
                            stay theirs to do.
                        </DialogDescription>
                    </DialogHeader>

                    {!live && (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            The console is not connected to the ADX backend, so no account can be opened from here right
                            now.
                        </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="advertiser-name" label="Name" errors={fieldErrors.name}>
                            <Input
                                id="advertiser-name"
                                value={fields.name}
                                onChange={set("name")}
                                autoComplete="off"
                                placeholder="Zomato"
                            />
                        </Field>
                        <Field
                            id="advertiser-mobile"
                            label="Mobile number"
                            hint="Their sign-in number. Ten digits."
                            errors={fieldErrors.mobile}
                        >
                            <Input
                                id="advertiser-mobile"
                                inputMode="tel"
                                value={fields.mobile}
                                onChange={set("mobile")}
                                autoComplete="off"
                                placeholder="98765 43210"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="advertiser-type">Type</Label>
                            <Select value={type} onValueChange={(value) => setType(value as AdvertiserType)}>
                                <SelectTrigger id="advertiser-type" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TYPES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {ADVERTISER_TYPE_LABELS[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {fieldErrors.type?.[0] && <p className="text-xs text-danger">{fieldErrors.type[0]}</p>}
                        </div>
                        <Field id="advertiser-email" label="Email" optional errors={fieldErrors.email}>
                            <Input
                                id="advertiser-email"
                                type="email"
                                value={fields.email}
                                onChange={set("email")}
                                autoComplete="off"
                                placeholder="ads@example.in"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="advertiser-company" label="Company name" optional errors={fieldErrors.companyName}>
                            <Input
                                id="advertiser-company"
                                value={fields.companyName}
                                onChange={set("companyName")}
                                autoComplete="off"
                                placeholder="Zomato Ltd"
                            />
                        </Field>
                        <Field id="advertiser-industry" label="Industry" optional errors={fieldErrors.industry}>
                            <IndustryPicker id="advertiser-industry" value={industry} onChange={setIndustry} disabled={!live} />
                        </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="advertiser-city" label="City" optional errors={fieldErrors.city}>
                            <CityCombobox
                                id="advertiser-city"
                                value={fields.city}
                                onChange={(city, picked) => setFields((current) => ({ ...current, city, state: picked ? (picked.geoState?.name ?? picked.state ?? current.state) : current.state }))}
                                placeholder="Bengaluru"
                            />
                        </Field>
                        <Field id="advertiser-state" label="State" optional errors={fieldErrors.state}>
                            <Input
                                id="advertiser-state"
                                value={fields.state}
                                onChange={set("state")}
                                autoComplete="off"
                                placeholder="Karnataka"
                            />
                        </Field>
                    </div>

                    {formError && (
                        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!live || !ready || busy}>
                            {busy ? "Opening…" : "Add advertiser"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({
    id,
    label,
    hint,
    optional,
    errors,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    optional?: boolean;
    errors?: string[];
    children: React.ReactNode;
}) {
    const error = errors?.[0];
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>
                {label}
                {optional && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
            </Label>
            {children}
            {error ? (
                <p className="text-xs text-danger">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
