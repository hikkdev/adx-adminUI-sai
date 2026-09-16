"use client";

import * as React from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/adx/city-combobox";
import { printPartnerService, type PrintPartner, type PrintPartnerInput, type PrintPartnerPatch } from "@/services/print-partners";

/* The backend's own patterns, so the dialog refuses what the API would. */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AMOUNT = /^\d+(\.\d{1,2})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Draft {
    name: string;
    mobile: string;
    legalName: string;
    gstin: string;
    panNumber: string;
    contactName: string;
    email: string;
    address: string;
    city: string;
    /** Comma-separated on screen, an array on the wire. */
    capabilities: string;
    maxWidthFt: string;
    turnaroundDays: string;
    notes: string;
}

const EMPTY: Draft = {
    name: "",
    mobile: "",
    legalName: "",
    gstin: "",
    panNumber: "",
    contactName: "",
    email: "",
    address: "",
    city: "",
    capabilities: "",
    maxWidthFt: "",
    turnaroundDays: "",
    notes: "",
};

const fromPartner = (partner: PrintPartner): Draft => ({
    name: partner.name,
    mobile: partner.mobile,
    legalName: partner.legalName ?? "",
    gstin: partner.gstin ?? "",
    panNumber: partner.panNumber ?? "",
    contactName: partner.contactName ?? "",
    email: partner.email ?? "",
    address: partner.address ?? "",
    city: partner.city ?? "",
    capabilities: partner.capabilities.join(", "),
    maxWidthFt: partner.maxWidthFt ?? "",
    turnaroundDays: partner.turnaroundDays === null ? "" : String(partner.turnaroundDays),
    notes: partner.notes ?? "",
});

/** The optional text fields as the wire wants them: trimmed, null when blank. */
const text = (value: string): string | null => value.trim() || null;

/**
 * What the draft sends. Exported for the test that pins it: the capabilities
 * split, the numbers parsed, blanks as null, the identifiers upper-cased.
 */
export function partnerBody(draft: Draft): Omit<PrintPartnerInput, "mobile"> {
    return {
        name: draft.name.trim(),
        legalName: text(draft.legalName),
        gstin: text(draft.gstin.toUpperCase()),
        panNumber: text(draft.panNumber.toUpperCase()),
        contactName: text(draft.contactName),
        email: text(draft.email),
        address: text(draft.address),
        city: text(draft.city),
        capabilities: draft.capabilities
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        maxWidthFt: text(draft.maxWidthFt),
        turnaroundDays: draft.turnaroundDays.trim() === "" ? null : Number(draft.turnaroundDays),
        notes: text(draft.notes),
    };
}

/** The fields whose value differs from the row — a PATCH names those and nothing beside them. */
export function partnerPatch(before: PrintPartner, draft: Draft): PrintPartnerPatch {
    const next = partnerBody(draft);
    const current = partnerBody(fromPartner(before));
    const patch: PrintPartnerPatch = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
        const a = next[key];
        const b = current[key];
        const same = Array.isArray(a) && Array.isArray(b) ? a.join("\u0000") === b.join("\u0000") : a === b;
        if (!same) (patch as Record<string, unknown>)[key] = a;
    }
    return patch;
}

interface PartnerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Editing this one; absent for a new partner. */
    partner?: PrintPartner;
    onSaved: (partner: PrintPartner) => void;
}

/**
 * A print partner at the desk (Lot B, B4b).
 *
 * The mobile is the account — unique on User, sign-in disabled, never an
 * existing person's number (409) — so it is typed once at creation and
 * cannot be edited. Everything else describes the shop: the legal name,
 * GSTIN and PAN ops vetted instead of KYC, the contact, the address the
 * agent collects from, what it can print and how wide, and the turnaround.
 */
export function PartnerDialog({ open, onOpenChange, partner, onSaved }: PartnerDialogProps) {
    const [draft, setDraft] = React.useState<Draft>(partner ? fromPartner(partner) : EMPTY);
    const [saving, setSaving] = React.useState(false);
    const [wasOpen, setWasOpen] = React.useState(open);

    /* Reset the draft each time the dialog opens, from whichever row it is
       opened on — done during render rather than in an effect, which is the
       React-endorsed pattern for state that follows a prop. */
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setDraft(partner ? fromPartner(partner) : EMPTY);
    }

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

    const gstin = draft.gstin.trim().toUpperCase();
    const pan = draft.panNumber.trim().toUpperCase();
    const problems = {
        name: draft.name.trim().length < 2,
        mobile: !partner && draft.mobile.trim().replace(/\D/g, "").length < 10,
        gstin: gstin !== "" && !GSTIN.test(gstin),
        pan: pan !== "" && !PAN.test(pan),
        email: draft.email.trim() !== "" && !EMAIL.test(draft.email.trim()),
        maxWidthFt: draft.maxWidthFt.trim() !== "" && !AMOUNT.test(draft.maxWidthFt.trim()),
        turnaroundDays: draft.turnaroundDays.trim() !== "" && !/^\d{1,3}$/.test(draft.turnaroundDays.trim()),
    };
    const complete = !Object.values(problems).some(Boolean);
    const patch = partner ? partnerPatch(partner, draft) : null;
    const dirty = patch === null || Object.keys(patch).length > 0;

    async function save() {
        setSaving(true);
        try {
            const saved = partner
                ? await printPartnerService.update(partner.id, patch ?? {})
                : await printPartnerService.create({ mobile: draft.mobile.trim(), ...partnerBody(draft) });
            toast.success(partner ? `${saved.name} updated` : `${saved.name} is on the roster`, {
                description: partner
                    ? undefined
                    : `${saved.displayId ?? "A PRT id"} allocated. Its wallet is open; record a bank account before the first job is paid.`,
            });
            onOpenChange(false);
            onSaved(saved);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The partner did not reach ADX.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{partner ? `Edit ${partner.name}` : "Add a print partner"}</DialogTitle>
                    <DialogDescription>
                        {partner
                            ? "The mobile is the account and cannot change; everything else can."
                            : "A shop ADX pays to print. Its account never signs in; ops records its bank account and raises its withdrawals."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-name">Shop name</Label>
                        <Input id="partner-name" value={draft.name} onChange={(event) => set("name", event.target.value)} aria-invalid={problems.name || undefined} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-mobile">Mobile</Label>
                        <Input
                            id="partner-mobile"
                            value={draft.mobile}
                            onChange={(event) => set("mobile", event.target.value)}
                            placeholder="+91 98450 12345"
                            disabled={Boolean(partner)}
                            inputMode="tel"
                            aria-invalid={problems.mobile || undefined}
                        />
                        {!partner && (
                            <p className="text-xs text-muted-foreground">
                                Must not belong to an ADX account already; a partner needs its own number.
                            </p>
                        )}
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="partner-legal">Legal name</Label>
                        <Input id="partner-legal" value={draft.legalName} onChange={(event) => set("legalName", event.target.value)} placeholder="As on the GST registration" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-gstin">GSTIN</Label>
                        <Input
                            id="partner-gstin"
                            value={draft.gstin}
                            onChange={(event) => set("gstin", event.target.value.toUpperCase())}
                            className="font-mono uppercase"
                            maxLength={15}
                            aria-invalid={problems.gstin || undefined}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-pan">PAN</Label>
                        <Input
                            id="partner-pan"
                            value={draft.panNumber}
                            onChange={(event) => set("panNumber", event.target.value.toUpperCase())}
                            className="font-mono uppercase"
                            maxLength={10}
                            aria-invalid={problems.pan || undefined}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-contact">Contact</Label>
                        <Input id="partner-contact" value={draft.contactName} onChange={(event) => set("contactName", event.target.value)} placeholder="Who the agent asks for" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-email">Email</Label>
                        <Input id="partner-email" type="email" value={draft.email} onChange={(event) => set("email", event.target.value)} aria-invalid={problems.email || undefined} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="partner-address">Address</Label>
                        <Textarea id="partner-address" value={draft.address} onChange={(event) => set("address", event.target.value)} rows={2} placeholder="Where the agent collects from" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-city">City</Label>
                        <CityCombobox id="partner-city" value={draft.city} onChange={(city) => set("city", city)} placeholder="Where the shop is" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-capabilities">Capabilities</Label>
                        <Input id="partner-capabilities" value={draft.capabilities} onChange={(event) => set("capabilities", event.target.value)} placeholder="flex, vinyl, backlit — comma-separated" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-width">Widest print (ft)</Label>
                        <Input id="partner-width" inputMode="decimal" value={draft.maxWidthFt} onChange={(event) => set("maxWidthFt", event.target.value)} className="tabular-nums" aria-invalid={problems.maxWidthFt || undefined} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="partner-turnaround">Turnaround (days)</Label>
                        <Input id="partner-turnaround" inputMode="numeric" value={draft.turnaroundDays} onChange={(event) => set("turnaroundDays", event.target.value)} className="tabular-nums" aria-invalid={problems.turnaroundDays || undefined} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="partner-notes">Notes</Label>
                        <Textarea id="partner-notes" value={draft.notes} onChange={(event) => set("notes", event.target.value)} rows={2} placeholder="Anything the next person at the desk should know" />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void save()} disabled={saving || !complete || !dirty}>
                        {saving ? "Saving…" : partner ? "Save changes" : "Add partner"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
