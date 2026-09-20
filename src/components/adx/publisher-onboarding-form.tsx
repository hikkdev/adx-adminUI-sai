"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { CityCombobox } from "@/components/adx/city-combobox";
import { AgentPicker } from "@/components/adx/add-publisher-form";
import { PinPicker } from "@/components/adx/pin-picker";
import type { AgentSummary } from "@/services/agents";
import { PUBLISHER_TYPES, PUBLISHER_TYPE_LABEL, publishersService, type CreatedPublisher, type PublisherType } from "@/services/publishers";
import type { Publisher } from "@/types";

/**
 * QR-13 — the desk onboards a publisher the way the app's ladder does.
 *
 * One form, two uses: "Add publisher" (create) and the party page's "Edit
 * details" (edit). Its sections are the ladder's, in the ladder's order —
 * account type, the person, the address off the map with its pin, the
 * business, the contact person — and its required fields are the app's:
 * first and last name, the number, email, date of birth (18 or over),
 * address, city, state for everyone; a GSTIN for a business; a contact
 * person with a number for anyone but an individual. The server applies
 * the same rules (`deskOnboarding`), so what passes here lands.
 *
 * What happens on create: the account is opened with the number and the
 * PUBLISHER role, the publisher linked to it, and — with the basics in —
 * the onboarding marked complete. The owner's first sign-in is OTP →
 * platform terms → home; nothing is asked twice.
 */

export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

export const GENDER_LABEL: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other", PREFER_NOT_TO_SAY: "Prefer not to say" };

export interface PublisherFormValues {
    type: PublisherType;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    dateOfBirth: string;
    gender: Gender | "";
    address: string;
    city: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    /** The registered name — for an individual, the person's own, composed. */
    name: string;
    gstin: string;
    contactName: string;
    contactMobile: string;
    contactEmail: string;
}

export const EMPTY_VALUES: PublisherFormValues = {
    type: "INDIVIDUAL",
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    city: "",
    state: "",
    latitude: null,
    longitude: null,
    name: "",
    gstin: "",
    contactName: "",
    contactMobile: "",
    contactEmail: "",
};

/** The form's values off a publisher the desk already holds. */
export function valuesOf(publisher: Publisher): PublisherFormValues {
    const person = publisher.person;
    return {
        type: (publisher.type as PublisherType | null) ?? "INDIVIDUAL",
        firstName: person?.firstName ?? "",
        lastName: person?.lastName ?? "",
        mobile: publisher.mobile,
        email: publisher.email ?? "",
        dateOfBirth: person?.dateOfBirth ?? "",
        gender: (person?.gender as Gender | null) ?? "",
        address: publisher.address ?? "",
        city: publisher.city ?? "",
        state: publisher.state ?? "",
        latitude: publisher.latitude,
        longitude: publisher.longitude,
        name: publisher.name,
        gstin: publisher.gstin ?? "",
        contactName: publisher.contactName ?? "",
        contactMobile: publisher.contactMobile ?? "",
        contactEmail: publisher.contactEmail ?? "",
    };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE = /^[6-9]\d{9}$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The latest birthday an 18-year-old can have, fixed when the module loads (a render must not read the clock). */
const DOB_MAX = new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10);

function yearsAgo(iso: string): number | null {
    if (!DATE.test(iso)) return null;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    let years = now.getUTCFullYear() - date.getUTCFullYear();
    const beforeBirthday = now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate());
    if (beforeBirthday) years -= 1;
    return years;
}

/** The app's rules, on the form's values: every problem, keyed by field. Exported for the test that pins them. */
export function problemsOf(values: PublisherFormValues, mode: "create" | "edit"): Partial<Record<keyof PublisherFormValues, string>> {
    const p: Partial<Record<keyof PublisherFormValues, string>> = {};
    const need = (key: keyof PublisherFormValues, message = "Needed — the app asks for it.") => {
        const v = values[key];
        if (v === null || v === undefined || String(v).trim() === "") p[key] = message;
    };
    need("firstName");
    need("lastName");
    if (mode === "create") {
        need("mobile", "Needed — the number they sign in with.");
        if (values.mobile.trim() && !MOBILE.test(values.mobile.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))) p.mobile = "Ten digits, starting 6 to 9.";
    }
    need("email", "Needed — the readiness rule counts it.");
    if (values.email.trim() && !EMAIL.test(values.email.trim())) p.email = "That does not look like an email address.";
    need("dateOfBirth", "Needed — the app asks for it.");
    if (values.dateOfBirth.trim()) {
        const years = yearsAgo(values.dateOfBirth.trim());
        if (years === null) p.dateOfBirth = "As YYYY-MM-DD.";
        else if (years < 18) p.dateOfBirth = "Must be 18 or over.";
        else if (years > 120) p.dateOfBirth = "That date is too far back.";
    }
    need("address");
    need("city");
    need("state");
    if (values.type !== "INDIVIDUAL") need("name", "The registered name, as on the documents.");
    if (values.type === "BUSINESS") need("gstin", "Needed for a business — the app asks for it.");
    if (values.gstin.trim() && !GSTIN.test(values.gstin.trim().toUpperCase())) p.gstin = "A GSTIN is 15 characters, like 22AAAAA0000A1Z5.";
    if (values.type !== "INDIVIDUAL") {
        need("contactName", "Needed — who ADX should reach.");
        need("contactMobile", "Needed — their number.");
    }
    if (values.contactMobile.trim() && !MOBILE.test(values.contactMobile.trim())) p.contactMobile = "Ten digits, starting 6 to 9.";
    if (values.contactEmail.trim() && !EMAIL.test(values.contactEmail.trim())) p.contactEmail = "That does not look like an email address.";
    if ((values.latitude === null) !== (values.longitude === null)) p.latitude = "The pin needs both halves.";
    return p;
}

/** The registered name an individual is known by: their own. */
export function registeredName(values: PublisherFormValues): string {
    if (values.type === "INDIVIDUAL") return `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
    return values.name.trim();
}

interface PublisherOnboardingFormProps {
    mode: "create" | "edit";
    /** Edit: the row the form starts from. */
    initial?: PublisherFormValues;
    /** Edit: whose row. */
    publisherId?: string;
    onCreated?: (publisher: CreatedPublisher) => void;
    onSaved?: () => void;
    onCancel?: () => void;
}

export function PublisherOnboardingForm({ mode, initial, publisherId, onCreated, onSaved, onCancel }: PublisherOnboardingFormProps) {
    const [values, setValues] = React.useState<PublisherFormValues>(initial ?? EMPTY_VALUES);
    const [agent, setAgent] = React.useState<AgentSummary | null>(null);
    const [touched, setTouched] = React.useState<Partial<Record<keyof PublisherFormValues, boolean>>>({});
    const [tried, setTried] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [serverErrors, setServerErrors] = React.useState<Record<string, string[]>>({});

    const set = <K extends keyof PublisherFormValues>(key: K, value: PublisherFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
    const touch = (key: keyof PublisherFormValues) => setTouched((t) => ({ ...t, [key]: true }));

    const problems = React.useMemo(() => problemsOf(values, mode), [values, mode]);
    const individual = values.type === "INDIVIDUAL";
    const ready = Object.keys(problems).length === 0;

    const shown = (key: keyof PublisherFormValues): string | undefined => serverErrors[key]?.[0] ?? ((tried || touched[key]) ? problems[key] : undefined);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setTried(true);
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setServerErrors({});
        const common = {
            name: registeredName(values),
            email: values.email,
            type: values.type,
            city: values.city,
            firstName: values.firstName,
            lastName: values.lastName,
            dateOfBirth: values.dateOfBirth,
            ...(values.gender ? { gender: values.gender } : {}),
            address: values.address,
            state: values.state,
            ...(values.latitude !== null && values.longitude !== null ? { latitude: values.latitude, longitude: values.longitude } : {}),
            gstin: values.gstin.toUpperCase(),
            contactName: values.contactName,
            contactMobile: values.contactMobile,
            contactEmail: values.contactEmail,
        };
        try {
            if (mode === "create") {
                const publisher = await publishersService.create({ ...common, mobile: values.mobile, ...(agent ? { attributeToAgentId: agent.id } : {}) });
                toast.success(`${publisher.name} onboarded`, { description: publisher.displayId ?? "Identifier not minted" });
                onCreated?.(publisher);
            } else {
                await publishersService.update(publisherId!, common);
                toast.success("Details saved", { description: "The app shows them the next time they open it." });
                onSaved?.();
            }
        } catch (cause) {
            if (cause instanceof ApiError) {
                setServerErrors(cause.fieldErrors);
                setError(cause.message);
            } else {
                setError(cause instanceof Error ? cause.message : "That did not go through.");
            }
        } finally {
            setBusy(false);
        }
    }

    const field = (key: keyof PublisherFormValues, label: React.ReactNode, input: React.ReactNode, hint?: string) => (
        <div className="space-y-1.5" data-testid={`pf-${key}`}>
            <Label htmlFor={`pf-${key}-input`}>{label}</Label>
            {input}
            {shown(key) ? (
                <p className="text-xs text-danger" role="alert">
                    {shown(key)}
                </p>
            ) : hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );

    const text = (key: keyof PublisherFormValues, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <Input
            id={`pf-${key}-input`}
            value={String(values[key] ?? "")}
            onChange={(e) => set(key, e.target.value as never)}
            onBlur={() => touch(key)}
            aria-invalid={shown(key) ? true : undefined}
            className="h-9"
            {...props}
        />
    );

    const optional = <span className="font-normal text-muted-foreground">(optional)</span>;

    return (
        <form onSubmit={handleSubmit} className="mt-2 flex flex-1 flex-col gap-5" noValidate data-testid="publisher-onboarding-form">
            {/* ── 1 · account type ─────────────────────────────────────────── */}
            <Section n={1} title="Account type" blurb="Individual, business or organisation — it decides what else is asked, as it does on the phone.">
                <div className="grid grid-cols-2 gap-3">
                    {field(
                        "type",
                        "Account type",
                        <Select value={values.type} onValueChange={(v) => set("type", v as PublisherType)}>
                            <SelectTrigger id="pf-type-input" className="h-9" aria-label="Account type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PUBLISHER_TYPES.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {PUBLISHER_TYPE_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>,
                    )}
                    {!individual
                        ? field("name", "Registered name", text("name", { placeholder: "As on the documents", autoComplete: "organization" }))
                        : null}
                </div>
            </Section>

            {/* ── 2 · the person ───────────────────────────────────────────── */}
            <Section n={2} title="The person" blurb="Who signs in. Their number is the account; the app never asks for the name again.">
                <div className="grid grid-cols-2 gap-3">
                    {field("firstName", "First name", text("firstName", { autoComplete: "given-name", autoCapitalize: "words" }))}
                    {field("lastName", "Last name", text("lastName", { autoComplete: "family-name", autoCapitalize: "words" }))}
                    {field(
                        "mobile",
                        "Mobile",
                        text("mobile", { type: "tel", inputMode: "tel", placeholder: "The number they sign in with", disabled: mode === "edit" }),
                        mode === "edit" ? "The identity; it does not change here." : undefined,
                    )}
                    {field("email", "Email", text("email", { type: "email", autoComplete: "email", placeholder: "owner@business.in" }))}
                    {field("dateOfBirth", "Date of birth", text("dateOfBirth", { type: "date", max: DOB_MAX }), "18 or over.")}
                    {field(
                        "gender",
                        <>Gender {optional}</>,
                        <Select value={values.gender || "__none"} onValueChange={(v) => set("gender", (v === "__none" ? "" : v) as Gender | "")}>
                            <SelectTrigger id="pf-gender-input" className="h-9" aria-label="Gender">
                                <SelectValue placeholder="Not said" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none">Not said</SelectItem>
                                {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                                    <SelectItem key={g} value={g}>
                                        {GENDER_LABEL[g]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>,
                    )}
                </div>
            </Section>

            {/* ── 3 · the address ──────────────────────────────────────────── */}
            <Section n={3} title="Address" blurb="Search the map the way the app does; the pin can be dragged to the door, and the coordinates typed.">
                <PinPicker
                    id="pf-pin"
                    latitude={values.latitude === null ? "" : String(values.latitude)}
                    longitude={values.longitude === null ? "" : String(values.longitude)}
                    onChange={({ latitude, longitude }) => {
                        const lat = latitude.trim() === "" ? null : Number(latitude);
                        const lng = longitude.trim() === "" ? null : Number(longitude);
                        setValues((v) => ({ ...v, latitude: lat !== null && Number.isFinite(lat) ? lat : null, longitude: lng !== null && Number.isFinite(lng) ? lng : null }));
                    }}
                    onAddress={(place) =>
                        setValues((v) => ({
                            ...v,
                            address: place.formattedAddress || v.address,
                            city: place.city ?? v.city,
                            state: place.state ?? v.state,
                        }))
                    }
                    title={values.address || "The address"}
                    labels={{ search: "Find the address" }}
                    placeholders={{ search: "Type a building, street or landmark" }}
                />
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">{field("address", "Address", text("address", { placeholder: "Building, street, area", autoComplete: "street-address" }))}</div>
                    {field(
                        "city",
                        "City",
                        <CityCombobox id="pf-city-input" value={values.city} onChange={(city) => set("city", city)} stages={["LAUNCHED", "SEEDING"]} placeholder="e.g. Bengaluru" className="[&_input]:h-9" />,
                    )}
                    {field("state", "State", text("state", { placeholder: "e.g. Karnataka", autoCapitalize: "words" }))}
                </div>
                {shown("latitude") ? <p className="text-xs text-danger">{shown("latitude")}</p> : null}
            </Section>

            {/* ── 4 · the business ─────────────────────────────────────────── */}
            {!individual ? (
                <Section n={4} title={values.type === "BUSINESS" ? "Business" : "Organisation"} blurb={values.type === "BUSINESS" ? "The GSTIN as printed on the certificate." : "The GSTIN, if registered for GST."}>
                    {field("gstin", values.type === "BUSINESS" ? "GSTIN" : <>GSTIN {optional}</>, text("gstin", { placeholder: "22AAAAA0000A1Z5", maxLength: 15, autoCapitalize: "characters" }))}
                </Section>
            ) : null}

            {/* ── 5 · the contact person ───────────────────────────────────── */}
            {!individual ? (
                <Section n={5} title="Contact person" blurb="Who ADX should reach about this account.">
                    <div className="grid grid-cols-2 gap-3">
                        {field("contactName", "Contact person", text("contactName", { autoCapitalize: "words" }))}
                        {field("contactMobile", "Their mobile", text("contactMobile", { type: "tel", inputMode: "tel", maxLength: 10 }))}
                        <div className="col-span-2">{field("contactEmail", <>Their email {optional}</>, text("contactEmail", { type: "email" }))}</div>
                    </div>
                </Section>
            ) : null}

            {mode === "create" ? (
                <Section n={individual ? 4 : 6} title="Attribution" blurb="On nobody's book unless an agent is named.">
                    <AgentPicker value={agent} onChange={setAgent} />
                </Section>
            ) : null}

            {error && (
                <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                    {ready ? "Everything the app would ask is in." : `${Object.keys(problems).length} field${Object.keys(problems).length === 1 ? "" : "s"} still needed — the app's rules.`}
                </p>
                <div className="flex gap-2">
                    {onCancel ? (
                        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                            Cancel
                        </Button>
                    ) : null}
                    <Button type="submit" disabled={busy} data-testid="pf-submit">
                        {busy ? (mode === "create" ? "Onboarding…" : "Saving…") : mode === "create" ? "Onboard publisher" : "Save details"}
                    </Button>
                </div>
            </div>
        </form>
    );
}

function Section({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3" data-testid={`pf-section-${n}`}>
            <div>
                <h4 className="text-sm font-semibold">
                    <span className="mr-1.5 text-muted-foreground">{n} ·</span>
                    {title}
                </h4>
                <p className="text-xs text-muted-foreground">{blurb}</p>
            </div>
            {children}
        </section>
    );
}
