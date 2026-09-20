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
import { GENDER_LABEL, type Gender } from "@/components/adx/publisher-onboarding-form";
import { advertiserService, type CreateAdvertiserInput, type UpdateAdvertiserInput } from "@/services/advertisers";
import { ADVERTISER_TYPE_LABELS, type Advertiser, type AdvertiserType } from "@/types";
import { IndustryPicker } from "./industry-picker";

/**
 * QR-15 — the desk onboards an advertiser the way the app does.
 *
 * One form, two uses: "Onboard an advertiser" (create) and the party
 * page's "Edit details" (edit). Its sections are the app's, in the app's
 * order — the account type, the person, the billing address — and its
 * required fields are exactly what the app's own flow collects before the
 * first booking: first and last name, the number, the billing address and
 * the city for everyone; a company name for anyone but an individual.
 * Email, date of birth, gender, state, industry and GSTIN are offered and
 * optional — the app does not ask an advertiser for them. The server
 * applies the same rules (`deskOnboarding`), so what passes here lands.
 *
 * What happens on create: the account is opened with the number and the
 * ADVERTISER role, the profile linked to it, its wallet and brand made.
 * The owner's first sign-in is OTP → platform terms → home, where the
 * profile gate finds its answers already in; KYC, the agreement and the
 * funds stay theirs to do.
 */

export interface AdvertiserFormValues {
    type: AdvertiserType;
    /** The registered name — for anyone but an individual. */
    companyName: string;
    industry: string;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    dateOfBirth: string;
    gender: Gender | "";
    billingAddress: string;
    city: string;
    state: string;
    gstin: string;
}

export const EMPTY_ADVERTISER_VALUES: AdvertiserFormValues = {
    type: "INDIVIDUAL",
    companyName: "",
    industry: "",
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    billingAddress: "",
    city: "",
    state: "",
    gstin: "",
};

/** The form's values off an advertiser the desk already holds — the person off the account behind it, or the row's name split while no account backs it. */
export function advertiserValuesOf(advertiser: Advertiser): AdvertiserFormValues {
    const person = advertiser.person ?? null;
    const [first = "", ...rest] = advertiser.name.trim().split(/\s+/);
    return {
        type: advertiser.type,
        companyName: advertiser.companyName ?? "",
        industry: advertiser.industry ?? "",
        firstName: person?.firstName ?? (person ? "" : first),
        lastName: person?.lastName ?? (person ? "" : rest.join(" ")),
        mobile: advertiser.contact,
        email: advertiser.email ?? "",
        dateOfBirth: person?.dateOfBirth ?? "",
        gender: (person?.gender as Gender | null) ?? "",
        billingAddress: advertiser.billingAddress ?? "",
        city: advertiser.city ?? "",
        state: advertiser.state ?? "",
        gstin: advertiser.gstin ?? "",
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
export function advertiserProblemsOf(values: AdvertiserFormValues, mode: "create" | "edit"): Partial<Record<keyof AdvertiserFormValues, string>> {
    const p: Partial<Record<keyof AdvertiserFormValues, string>> = {};
    const need = (key: keyof AdvertiserFormValues, message = "Needed — the app asks for it.") => {
        if (String(values[key] ?? "").trim() === "") p[key] = message;
    };
    need("firstName");
    need("lastName");
    if (mode === "create") {
        need("mobile", "Needed — the number they sign in with.");
        if (values.mobile.trim() && !MOBILE.test(bareMobile(values.mobile))) p.mobile = "Ten digits, starting 6 to 9.";
    }
    if (values.email.trim() && !EMAIL.test(values.email.trim())) p.email = "That does not look like an email address.";
    if (values.dateOfBirth.trim()) {
        const years = yearsAgo(values.dateOfBirth.trim());
        if (years === null) p.dateOfBirth = "As YYYY-MM-DD.";
        else if (years < 18) p.dateOfBirth = "Must be 18 or over.";
        else if (years > 120) p.dateOfBirth = "That date is too far back.";
    }
    need("billingAddress", "Needed — the app asks for it before the first booking.");
    need("city");
    if (values.type !== "INDIVIDUAL") need("companyName", "Needed for a company or organisation — the app asks for it.");
    if (values.gstin.trim() && !GSTIN.test(values.gstin.trim().toUpperCase())) p.gstin = "A GSTIN is 15 characters, like 22AAAAA0000A1Z5.";
    return p;
}

/** Ten digits with whatever people type between groups stripped; the schema takes the bare number, not +91. */
export function bareMobile(typed: string): string {
    return typed.replace(/[\s-]+/g, "").replace(/^\+?91(?=\d{10}$)/, "");
}

/** The account holder's name — the person's own, composed; the company is its own column. */
export function personName(values: AdvertiserFormValues): string {
    return `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
}

interface AdvertiserOnboardingFormProps {
    mode: "create" | "edit";
    /** Edit: the row the form starts from. */
    initial?: AdvertiserFormValues;
    /** Edit: whose row. */
    advertiserId?: string;
    onCreated?: (advertiser: Advertiser) => void;
    onSaved?: () => void;
    onCancel?: () => void;
}

export function AdvertiserOnboardingForm({ mode, initial, advertiserId, onCreated, onSaved, onCancel }: AdvertiserOnboardingFormProps) {
    const [values, setValues] = React.useState<AdvertiserFormValues>(initial ?? EMPTY_ADVERTISER_VALUES);
    const [touched, setTouched] = React.useState<Partial<Record<keyof AdvertiserFormValues, boolean>>>({});
    const [tried, setTried] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [serverErrors, setServerErrors] = React.useState<Record<string, string[]>>({});

    const set = <K extends keyof AdvertiserFormValues>(key: K, value: AdvertiserFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
    const touch = (key: keyof AdvertiserFormValues) => setTouched((t) => ({ ...t, [key]: true }));

    const problems = React.useMemo(() => advertiserProblemsOf(values, mode), [values, mode]);
    const individual = values.type === "INDIVIDUAL";
    const ready = Object.keys(problems).length === 0;

    const shown = (key: keyof AdvertiserFormValues): string | undefined => serverErrors[key]?.[0] ?? ((tried || touched[key]) ? problems[key] : undefined);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setTried(true);
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        setServerErrors({});
        const common: Omit<UpdateAdvertiserInput, "industry"> = {
            name: personName(values),
            email: values.email,
            type: values.type,
            companyName: individual ? "" : values.companyName,
            city: values.city,
            state: values.state,
            firstName: values.firstName,
            lastName: values.lastName,
            dateOfBirth: values.dateOfBirth,
            ...(values.gender ? { gender: values.gender } : {}),
            billingAddress: values.billingAddress,
            gstin: values.gstin.toUpperCase(),
        };
        try {
            if (mode === "create") {
                const input: CreateAdvertiserInput = { ...common, name: personName(values), mobile: bareMobile(values.mobile), ...(values.industry ? { industry: values.industry } : {}) };
                const advertiser = await advertiserService.create(input);
                toast.success(`${advertiser.name} onboarded`, { description: advertiser.displayId ?? "Identifier not minted" });
                onCreated?.(advertiser);
            } else {
                // The industry clears with null: "" is not a value the picklist has.
                await advertiserService.update(advertiserId!, { ...common, industry: values.industry || null });
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

    const field = (key: keyof AdvertiserFormValues, label: React.ReactNode, input: React.ReactNode, hint?: string) => (
        <div className="space-y-1.5" data-testid={`af-${key}`}>
            <Label htmlFor={`af-${key}-input`}>{label}</Label>
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

    const text = (key: keyof AdvertiserFormValues, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <Input
            id={`af-${key}-input`}
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
        <form onSubmit={handleSubmit} className="mt-2 flex flex-1 flex-col gap-5" noValidate data-testid="advertiser-onboarding-form">
            {/* ── 1 · account type ─────────────────────────────────────────── */}
            <Section n={1} title="Account type" blurb="Individual, company, NGO or agency — it decides whether a company name is asked, as it does on the phone.">
                <div className="grid grid-cols-2 gap-3">
                    {field(
                        "type",
                        "Account type",
                        <Select value={values.type} onValueChange={(v) => set("type", v as AdvertiserType)}>
                            <SelectTrigger id="af-type-input" className="h-9" aria-label="Account type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(ADVERTISER_TYPE_LABELS) as AdvertiserType[]).map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {ADVERTISER_TYPE_LABELS[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>,
                    )}
                    {!individual
                        ? field("companyName", "Registered company name", text("companyName", { placeholder: "As on the documents", autoComplete: "organization" }))
                        : null}
                    {field("industry", <>Industry {optional}</>, <IndustryPicker id="af-industry-input" value={values.industry} onChange={(industry) => set("industry", industry)} />)}
                </div>
            </Section>

            {/* ── 2 · the person ───────────────────────────────────────────── */}
            <Section n={2} title="The person" blurb="Who signs in and books. Their number is the account; the app never asks for the name again.">
                <div className="grid grid-cols-2 gap-3">
                    {field("firstName", "First name", text("firstName", { autoComplete: "given-name", autoCapitalize: "words" }))}
                    {field("lastName", "Last name", text("lastName", { autoComplete: "family-name", autoCapitalize: "words" }))}
                    {field(
                        "mobile",
                        "Mobile",
                        text("mobile", { type: "tel", inputMode: "tel", placeholder: "The number they sign in with", disabled: mode === "edit" }),
                        mode === "edit" ? "The identity; it does not change here." : undefined,
                    )}
                    {field("email", <>Email {optional}</>, text("email", { type: "email", autoComplete: "email", placeholder: "ads@business.in" }))}
                    {field("dateOfBirth", <>Date of birth {optional}</>, text("dateOfBirth", { type: "date", max: DOB_MAX }), "18 or over.")}
                    {field(
                        "gender",
                        <>Gender {optional}</>,
                        <Select value={values.gender || "__none"} onValueChange={(v) => set("gender", (v === "__none" ? "" : v) as Gender | "")}>
                            <SelectTrigger id="af-gender-input" className="h-9" aria-label="Gender">
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

            {/* ── 3 · billing ──────────────────────────────────────────────── */}
            <Section n={3} title="Billing" blurb="Where the invoices go — the app asks for this before the first booking. The GSTIN is optional; with it they claim input credit.">
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">{field("billingAddress", "Billing address", text("billingAddress", { placeholder: "Building, street, area", autoComplete: "street-address" }))}</div>
                    {field(
                        "city",
                        "City",
                        <CityCombobox id="af-city-input" value={values.city} onChange={(city, picked) => setValues((v) => ({ ...v, city, state: picked ? (picked.geoState?.name ?? picked.state ?? v.state) : v.state }))} placeholder="e.g. Bengaluru" className="[&_input]:h-9" />,
                    )}
                    {field("state", <>State {optional}</>, text("state", { placeholder: "e.g. Karnataka", autoCapitalize: "words" }))}
                    <div className="col-span-2">{field("gstin", <>GSTIN {optional}</>, text("gstin", { placeholder: "22AAAAA0000A1Z5", maxLength: 15, autoCapitalize: "characters" }))}</div>
                </div>
            </Section>

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
                    <Button type="submit" disabled={busy} data-testid="af-submit">
                        {busy ? (mode === "create" ? "Onboarding…" : "Saving…") : mode === "create" ? "Onboard advertiser" : "Save details"}
                    </Button>
                </div>
            </div>
        </form>
    );
}

function Section({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3" data-testid={`af-section-${n}`}>
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
