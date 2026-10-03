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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CityCombobox } from "@/components/adx/city-combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { ADDRESS_LINE_PLACEHOLDER, AddressFinder, PIN_CODE, PIN_CODE_PLACEHOLDER, placeFill } from "@/components/adx/pin-picker";
import { useApiResource } from "@/lib/use-api-resource";
import {
    ENTITY_UPGRADE_LINE,
    ENTITY_VERIFIED_RULE,
    KYC_ENTITY_TYPE_FALLBACK,
    KYC_LOCKED_EXPLANATION,
    entityTypeLabel,
    isEntityUpgrade,
    isKycLocked,
    kycEntityTypeService,
    type KycEntityType,
    type KycEntityTypeLists,
} from "@/services/kyc-entity-types";
import { digioFailure } from "@/services/kyc-provider";
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
    state: string;
    postalCode: string;
    /** The shop's pin — never shown: set by the address bar's pick, kept as the row had it otherwise. */
    latitude: number | null;
    longitude: number | null;
    /** Comma-separated on screen, an array on the wire. */
    capabilities: string;
    maxWidthFt: string;
    turnaroundDays: string;
    notes: string;
    /** Phase D: what the shop verifies as — edit only; "" while none is chosen. Not part of `partnerBody`: it rides the PATCH only when changed. */
    entityType: KycEntityType | "";
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
    state: "",
    postalCode: "",
    latitude: null,
    longitude: null,
    capabilities: "",
    maxWidthFt: "",
    turnaroundDays: "",
    notes: "",
    entityType: "",
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
    state: partner.state ?? "",
    postalCode: partner.postalCode ?? "",
    latitude: partner.latitude ?? null,
    longitude: partner.longitude ?? null,
    capabilities: partner.capabilities.join(", "),
    maxWidthFt: partner.maxWidthFt ?? "",
    turnaroundDays: partner.turnaroundDays === null ? "" : String(partner.turnaroundDays),
    notes: partner.notes ?? "",
    entityType: partner.entityType ?? "",
});

/** The optional text fields as the wire wants them: trimmed, null when blank. */
const text = (value: string): string | null => value.trim() || null;

/** The pin as the wire wants it: both coordinates, or neither. */
function pinOf(draft: Pick<Draft, "latitude" | "longitude">): { latitude: number; longitude: number } | null {
    return draft.latitude !== null && draft.longitude !== null ? { latitude: draft.latitude, longitude: draft.longitude } : null;
}

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
        state: text(draft.state),
        postalCode: text(draft.postalCode),
        latitude: pinOf(draft)?.latitude ?? null,
        longitude: pinOf(draft)?.longitude ?? null,
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
    // Phase D: the entity type, named only when the desk chose one that the row does not already carry.
    if (draft.entityType && draft.entityType !== (before.entityType ?? "")) patch.entityType = draft.entityType;
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
 *
 * The address (the owner, 1 Oct 2026): the one "Find the address" bar over
 * plain boxes — Address, City | State, PIN code — and no map. A pick fills
 * the boxes and keeps the shop's coordinates silently for the save.
 *
 * Phase D (1 Oct 2026): an edit also carries the entity type — one of the
 * four a print partner may verify as, which picks the Digio workflow. On a
 * VERIFIED shop the one change the server takes is Individual → a business
 * form; it fires a fresh Digio request and puts the KYC back to pending, so
 * the save is confirmed first. Any other change there is 409 `KYC_LOCKED`,
 * and Digio failing the upgrade is said in the owner's words.
 */
export function PartnerDialog({ open, onOpenChange, partner, onSaved }: PartnerDialogProps) {
    const [draft, setDraft] = React.useState<Draft>(partner ? fromPartner(partner) : EMPTY);
    const [saving, setSaving] = React.useState(false);
    const [wasOpen, setWasOpen] = React.useState(open);
    /* Phase D: the four entity types a print partner may be, labelled by the server; read once an edit opens. */
    const [confirmingUpgrade, setConfirmingUpgrade] = React.useState(false);
    const editing = Boolean(partner) && open;
    const entityLists = useApiResource<KycEntityTypeLists>(`kyc:entity-types:${editing ? "read" : "unused"}`, () => (editing ? kycEntityTypeService.lists() : Promise.resolve(KYC_ENTITY_TYPE_FALLBACK)));
    const entityOptions = (entityLists.data ?? KYC_ENTITY_TYPE_FALLBACK).PRINT_PARTNER;
    const verified = partner?.kycStatus === "VERIFIED";

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
        postalCode: draft.postalCode.trim() !== "" && !PIN_CODE.test(draft.postalCode.trim()),
    };
    const complete = !Object.values(problems).some(Boolean);
    const patch = partner ? partnerPatch(partner, draft) : null;
    const dirty = patch === null || Object.keys(patch).length > 0;
    const upgrade = Boolean(patch?.entityType) && isEntityUpgrade(verified, partner?.entityType, draft.entityType);

    async function save() {
        setSaving(true);
        try {
            const saved = partner
                ? await printPartnerService.update(partner.id, patch ?? {})
                : await printPartnerService.create({ mobile: draft.mobile.trim(), ...partnerBody(draft) });
            toast.success(partner ? `${saved.name} updated` : `${saved.name} is on the roster`, {
                description: partner
                    ? upgrade
                        ? "A fresh Digio request went out for the business. The account is 'verification pending' until it is verified."
                        : undefined
                    : `${saved.displayId ?? "A PRT id"} allocated. Its wallet is open; record a bank account before the first job is paid.`,
            });
            onOpenChange(false);
            onSaved(saved);
        } catch (cause) {
            const failure = digioFailure(cause);
            if (isKycLocked(cause)) {
                // Phase D: a verified shop's type moves only from Individual to a business form; nothing in the patch was written.
                toast.error("The entity type was not changed", { description: KYC_LOCKED_EXPLANATION });
            } else if (failure) {
                // Phase D: the upgrade asks Digio first; when Digio fails it, the individual stays verified.
                toast.error(failure);
            } else {
                toast.error(cause instanceof Error ? cause.message : "The partner did not reach ADX.");
            }
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
                    </div>
                    {/* One line under the whole row, never a hint under one cell (the form symmetry policy). */}
                    {!partner && (
                        <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">
                            The mobile must not belong to an ADX account already; a partner needs its own number.
                        </p>
                    )}
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="partner-legal">Legal name</Label>
                        <Input id="partner-legal" value={draft.legalName} onChange={(event) => set("legalName", event.target.value)} placeholder="As on the GST registration" />
                    </div>
                    {/* Phase D: what the shop verifies as — a row of its own, with its one line of guidance under it. */}
                    {partner && (
                        <div className="space-y-1.5 sm:col-span-2" data-testid="partner-entity-type">
                            <Label htmlFor="partner-entity-type-input">Entity type</Label>
                            <Select value={draft.entityType || undefined} onValueChange={(value) => set("entityType", value as KycEntityType)}>
                                <SelectTrigger id="partner-entity-type-input" aria-label="Entity type">
                                    <SelectValue placeholder="Not chosen yet" />
                                </SelectTrigger>
                                <SelectContent>
                                    {entityOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                The entity type decides which Digio workflow the shop is verified on. {verified ? ENTITY_VERIFIED_RULE : "While none is chosen, it is asked when verification starts."}
                            </p>
                        </div>
                    )}
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
                    {/* The one address bar, no map: a pick fills the boxes under it and keeps the shop's coordinates, never shown. */}
                    <AddressFinder
                        id="partner-address-find"
                        className="sm:col-span-2"
                        near={pinOf(draft)}
                        onPlace={(place) => setDraft((current) => ({ ...current, ...placeFill(place, current) }))}
                    />
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="partner-address">Address</Label>
                        <Input id="partner-address" value={draft.address} onChange={(event) => set("address", event.target.value)} placeholder={ADDRESS_LINE_PLACEHOLDER} autoComplete="street-address" />
                    </div>
                    <div className="content-start space-y-1.5">
                        <Label htmlFor="partner-city">City</Label>
                        <CityCombobox
                            id="partner-city"
                            value={draft.city}
                            onChange={(city, picked) => setDraft((current) => ({ ...current, city, state: picked ? (picked.geoState?.name ?? picked.state ?? current.state) : current.state }))}
                            placeholder="e.g. Bengaluru"
                        />
                    </div>
                    <div className="content-start space-y-1.5">
                        <Label htmlFor="partner-state">State</Label>
                        <Input id="partner-state" value={draft.state} onChange={(event) => set("state", event.target.value)} placeholder="e.g. Karnataka" autoCapitalize="words" />
                    </div>
                    <div className="content-start space-y-1.5">
                        <Label htmlFor="partner-postal-code">PIN code</Label>
                        <Input
                            id="partner-postal-code"
                            value={draft.postalCode}
                            onChange={(event) => set("postalCode", event.target.value)}
                            placeholder={PIN_CODE_PLACEHOLDER}
                            inputMode="numeric"
                            maxLength={6}
                            autoComplete="postal-code"
                            className="tabular-nums"
                            aria-invalid={problems.postalCode || undefined}
                        />
                    </div>
                    {/* The PIN code sits alone on its row, left — the shop's next fields are not part of its address. */}
                    <div className="hidden sm:block" aria-hidden />
                    <div className="space-y-1.5 sm:col-span-2">
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
                    {/* Phase D: a verified Individual becoming a business restarts verification — said before it is saved. */}
                    <Button onClick={() => (upgrade ? setConfirmingUpgrade(true) : void save())} disabled={saving || !complete || !dirty}>
                        {saving ? "Saving…" : partner ? "Save changes" : "Add partner"}
                    </Button>
                </DialogFooter>

                <ConfirmDialog
                    open={confirmingUpgrade}
                    onOpenChange={setConfirmingUpgrade}
                    title={`Change the entity type to ${entityTypeLabel(draft.entityType, entityOptions)}?`}
                    description={`${ENTITY_UPGRADE_LINE} A fresh Digio request goes out for the business when this is saved.`}
                    confirmLabel="Save and restart verification"
                    busy={saving}
                    onConfirm={() => void save()}
                />
            </DialogContent>
        </Dialog>
    );
}
