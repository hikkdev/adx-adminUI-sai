"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/lib/use-api-resource";
import { AddressFinder } from "@/components/adx/pin-picker";
import { CityCombobox } from "@/components/adx/city-combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { GENDER_LABEL, type Gender } from "@/components/adx/publisher-onboarding-form";
import { advertiserService, type CreateAdvertiserInput, type UpdateAdvertiserInput } from "@/services/advertisers";
import {
    ACCOUNT_TYPES,
    ACCOUNT_TYPE_LABEL,
    ENTITY_CREATE_GUIDANCE,
    ENTITY_UPGRADE_LINE,
    ENTITY_VERIFIED_RULE,
    KYC_ENTITY_TYPE_FALLBACK,
    KYC_LOCKED_EXPLANATION,
    entityFitsAccountType,
    entityOptionsFor,
    entityTypeLabel,
    isEntityUpgrade,
    isKycLocked,
    kycEntityTypeService,
    type AccountType,
    type KycEntityType,
    type KycEntityTypeLists,
} from "@/services/kyc-entity-types";
import { digioFailure } from "@/services/kyc-provider";
import type { GeocodedPlace } from "@/services/geo";
import { ladderAccountType } from "@/components/adx/flow-renderer";
import type { Advertiser, AdvertiserType } from "@/types";
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
 *
 * Phase D (1 Oct 2026): the edit also carries the entity type — what the
 * advertiser verifies as, which picks the Digio workflow — beside the
 * account type, and sends it only when the desk changed it. On a VERIFIED
 * advertiser the one change the server takes is Individual → a business
 * form; it fires a fresh Digio request and puts the KYC back to pending, so
 * the save is confirmed first. Any other change there is 409 `KYC_LOCKED`,
 * explained under the form, and Digio failing the upgrade is said in the
 * owner's words.
 *
 * DR 08 parity (1 Oct 2026): the account type is the apps' three —
 * Individual, Business, Organisation — and the precise legal form (the
 * entity type) is the select beside it, in the create as in the edit,
 * filtered to the account type's kinds. The legacy `type` the backend
 * still keys on is derived (`advertiserTypeOf`): a business is COMMERCIAL —
 * an agency already on the books stays AGENCY — and an organisation NGO.
 */

/**
 * The legacy `AdvertiserType` the backend keys on, from DR 08's account
 * type: INDIVIDUAL; COMMERCIAL for a business, unless the row is already an
 * AGENCY, which it stays; NGO for an organisation.
 */
export function advertiserTypeOf(accountType: AccountType, storedType: AdvertiserType | null | undefined): AdvertiserType {
    if (accountType === "INDIVIDUAL") return "INDIVIDUAL";
    if (accountType === "BUSINESS") return storedType === "AGENCY" ? "AGENCY" : "COMMERCIAL";
    return "NGO";
}

export interface AdvertiserFormValues {
    /** DR 08's three. The legacy `type` is derived from it (`advertiserTypeOf`). */
    accountType: AccountType;
    /** The legacy type on the row the form opened on — null on a create — so an agency stays one. */
    storedType: AdvertiserType | null;
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
    /** AD-1: the six-digit PIN and the country on the billing address. */
    postalCode: string;
    country: string;
    gstin: string;
}

export const EMPTY_ADVERTISER_VALUES: AdvertiserFormValues = {
    accountType: "INDIVIDUAL",
    storedType: null,
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
    postalCode: "",
    country: "",
    gstin: "",
};

/** The form's values off an advertiser the desk already holds — the person off the account behind it, or the row's name split while no account backs it. */
export function advertiserValuesOf(advertiser: Advertiser): AdvertiserFormValues {
    const person = advertiser.person ?? null;
    const [first = "", ...rest] = advertiser.name.trim().split(/\s+/);
    return {
        // INDIVIDUAL → Individual; COMMERCIAL and AGENCY → Business; NGO → Organisation.
        accountType: ladderAccountType("ADVERTISER", advertiser.type),
        storedType: advertiser.type ?? null,
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
        postalCode: advertiser.postalCode ?? "",
        country: advertiser.country ?? "",
        gstin: advertiser.gstin ?? "",
    };
}

/** AD-1: an Indian PIN is exactly six digits — the schema's own rule. */
const POSTAL_CODE = /^\d{6}$/;

/**
 * Address search everywhere (the owner, 1 Oct 2026): a place picked for the
 * billing address fills the line, the city, the state and the PIN — only what
 * the place names; a field it is silent on keeps what is typed. The geo answer
 * names no country, so the country is left alone. Never coordinates: a billing
 * address is not a place anyone travels to.
 */
export function withBillingPlace(values: AdvertiserFormValues, place: GeocodedPlace): AdvertiserFormValues {
    const pin = place.postalCode?.replace(/\s+/g, "") ?? "";
    return {
        ...values,
        billingAddress: place.formattedAddress || values.billingAddress,
        city: place.city || values.city,
        state: place.state || values.state,
        postalCode: POSTAL_CODE.test(pin) ? pin : values.postalCode,
    };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE = /^[6-9]\d{9}$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * AGE-1 (the owner, 29 Sep 2026): any valid date of birth — under 18 too; 18
 * or over is asked only when an order is placed. The latest a date may be is
 * today, fixed when the module loads (a render must not read the clock).
 */
const DOB_MAX = new Date().toISOString().slice(0, 10);

/** Why a typed date of birth is not a real one (a day, not in the future, at most 120 years back); null when it is. */
function dateOfBirthProblem(iso: string): string | null {
    if (!DATE.test(iso)) return "As YYYY-MM-DD.";
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return "As YYYY-MM-DD.";
    const now = new Date();
    if (date.getTime() > now.getTime()) return "Not a day in the future.";
    const oldest = new Date(Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate()));
    if (date.getTime() < oldest.getTime()) return "That date is too far back.";
    return null;
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
        const problem = dateOfBirthProblem(values.dateOfBirth.trim());
        if (problem) p.dateOfBirth = problem;
    }
    need("billingAddress", "Needed — the app asks for it before the first booking.");
    need("city");
    if (values.accountType !== "INDIVIDUAL") need("companyName", "Needed for a company or organisation — the app asks for it.");
    if (values.gstin.trim() && !GSTIN.test(values.gstin.trim().toUpperCase())) p.gstin = "A GSTIN is 15 characters, like 22AAAAA0000A1Z5.";
    /* AD-1: optional, but six digits when given — the schema refuses anything else. */
    if (values.postalCode.trim() && !POSTAL_CODE.test(values.postalCode.trim())) p.postalCode = "A PIN is six digits.";
    if (values.country.trim().length > 60) p.country = "At most 60 characters.";
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
    /**
     * Edit — Phase D: the entity type on the row (the effective value, null until one is known), whether the KYC is verified,
     * and whether the value is the stored column rather than read off the legacy type (`entityTypeStored`).
     */
    entity?: { value: KycEntityType | null; verified: boolean; stored?: boolean };
    onCreated?: (advertiser: Advertiser) => void;
    onSaved?: () => void;
    onCancel?: () => void;
}

export function AdvertiserOnboardingForm({ mode, initial, advertiserId, entity, onCreated, onSaved, onCancel }: AdvertiserOnboardingFormProps) {
    const [values, setValues] = React.useState<AdvertiserFormValues>(initial ?? EMPTY_ADVERTISER_VALUES);
    /* The account type the form opened on: an edit that moves off it may have to ask the kind again. */
    const [startAccountType] = React.useState<AccountType>(() => (initial ?? EMPTY_ADVERTISER_VALUES).accountType);
    const storedEntity = entity?.value ?? null;
    /* Phase D: the entity type, beside the values rather than in them — an edit sends it only when changed. Drawn for a business or an organisation; an individual is INDIVIDUAL. */
    const [entityType, setEntityType] = React.useState<KycEntityType | "">(storedEntity ?? "");
    const [confirmingUpgrade, setConfirmingUpgrade] = React.useState(false);
    const entityLists = useApiResource<KycEntityTypeLists>("kyc:entity-types:read", () => kycEntityTypeService.lists());
    const allEntityOptions = (entityLists.data ?? KYC_ENTITY_TYPE_FALLBACK).ADVERTISER;
    const accountType = values.accountType;
    const individual = accountType === "INDIVIDUAL";
    /* The account type's kinds, in its order — and the row's own value too while it does not fit, so the select never hides what is stored. */
    const entityOptions = React.useMemo(() => {
        const options = entityOptionsFor(accountType, allEntityOptions);
        if (entityType && !options.some((option) => option.value === entityType)) options.push({ value: entityType, label: entityTypeLabel(entityType, allEntityOptions) });
        return options;
    }, [accountType, allEntityOptions, entityType]);
    const chosenEntity: KycEntityType | "" = individual ? "INDIVIDUAL" : entityType;
    const entityChanged =
        mode === "edit" && chosenEntity !== "" && chosenEntity !== (storedEntity ?? "") && !(individual && startAccountType === "INDIVIDUAL");
    const upgrade = entityChanged && isEntityUpgrade(entity?.verified ?? false, storedEntity, chosenEntity);
    /*
     * An edit that moves the account type off the row's kind asks for the kind again when the row's value is the stored
     * column or the account is verified — saving without one would leave the two contradicting each other.
     */
    const entityProblem =
        mode === "edit" && !individual && accountType !== startAccountType && entityType === "" && storedEntity !== null && (entity?.stored === true || entity?.verified === true)
            ? `Choose the kind again — ${entityTypeLabel(storedEntity, allEntityOptions)} is not a kind of ${accountType === "BUSINESS" ? "business" : "organisation"}.`
            : null;

    /** The account type changes; the entity selection is kept when it fits the new one, put back when the desk returns to the row's own, and cleared otherwise. */
    const chooseAccountType = (next: AccountType) => {
        setValues((v) => ({ ...v, accountType: next }));
        if (next === "INDIVIDUAL") return;
        setEntityType((current) => {
            if (entityFitsAccountType(next, current)) return current;
            if (next === startAccountType && storedEntity) return storedEntity;
            return entityFitsAccountType(next, storedEntity) ? storedEntity : "";
        });
    };
    const [touched, setTouched] = React.useState<Partial<Record<keyof AdvertiserFormValues, boolean>>>({});
    const [tried, setTried] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [serverErrors, setServerErrors] = React.useState<Record<string, string[]>>({});

    const set = <K extends keyof AdvertiserFormValues>(key: K, value: AdvertiserFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
    const touch = (key: keyof AdvertiserFormValues) => setTouched((t) => ({ ...t, [key]: true }));

    const problems = React.useMemo(() => advertiserProblemsOf(values, mode), [values, mode]);
    const problemCount = Object.keys(problems).length + (entityProblem ? 1 : 0);
    const ready = problemCount === 0;

    const shown = (key: keyof AdvertiserFormValues): string | undefined => serverErrors[key]?.[0] ?? ((tried || touched[key]) ? problems[key] : undefined);

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setTried(true);
        if (!ready || busy) return;
        // Phase D: a verified Individual becoming a business restarts verification — said before it is saved.
        if (upgrade) setConfirmingUpgrade(true);
        else void save();
    }

    async function save() {
        setBusy(true);
        setError(null);
        setServerErrors({});
        const common: Omit<UpdateAdvertiserInput, "industry"> = {
            name: personName(values),
            email: values.email,
            type: advertiserTypeOf(accountType, values.storedType),
            companyName: individual ? "" : values.companyName,
            city: values.city,
            state: values.state,
            firstName: values.firstName,
            lastName: values.lastName,
            dateOfBirth: values.dateOfBirth,
            ...(values.gender ? { gender: values.gender } : {}),
            billingAddress: values.billingAddress,
            postalCode: values.postalCode,
            country: values.country,
            gstin: values.gstin.toUpperCase(),
        };
        try {
            if (mode === "create") {
                // The entity type rides when the desk chose one; an individual's is read off the account type by the server.
                const input: CreateAdvertiserInput = {
                    ...common,
                    name: personName(values),
                    mobile: bareMobile(values.mobile),
                    ...(values.industry ? { industry: values.industry } : {}),
                    ...(!individual && chosenEntity ? { entityType: chosenEntity } : {}),
                };
                const advertiser = await advertiserService.create(input);
                toast.success(`${advertiser.name} onboarded`, { description: advertiser.displayId ?? "Identifier not minted" });
                onCreated?.(advertiser);
            } else {
                // The industry clears with null: "" is not a value the picklist has.
                await advertiserService.update(advertiserId!, { ...common, industry: values.industry || null, ...(entityChanged && chosenEntity ? { entityType: chosenEntity } : {}) });
                toast.success("Details saved", {
                    description: upgrade
                        ? "A fresh Digio request went out for the business. The account is 'verification pending' until it is verified."
                        : "The app shows them the next time they open it.",
                });
                onSaved?.();
            }
        } catch (cause) {
            const failure = digioFailure(cause);
            if (isKycLocked(cause)) {
                // Phase D: a verified account's type moves only from Individual to a business form; nothing in the patch was written.
                setError(KYC_LOCKED_EXPLANATION);
            } else if (failure) {
                // Phase D: the upgrade asks Digio first; when Digio fails it, the individual stays verified.
                setError(failure);
            } else if (cause instanceof ApiError) {
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

    /** The one line of guidance under the account-type row (the form symmetry policy): the Phase D rule on an edit, the create's own otherwise. */
    const entityLine =
        entity && (!individual || entity.verified) ? (
            <p className="col-span-2 text-xs text-muted-foreground" data-testid="af-entity-rule">
                The entity type decides which Digio workflow the advertiser is verified on. {entity.verified ? ENTITY_VERIFIED_RULE : "While none is chosen, it is asked when verification starts."}
            </p>
        ) : !entity && !individual ? (
            <p className="col-span-2 text-xs text-muted-foreground" data-testid="af-entity-rule">
                {ENTITY_CREATE_GUIDANCE}
            </p>
        ) : null;

    return (
        <form onSubmit={handleSubmit} className="mt-2 flex flex-1 flex-col gap-5" noValidate data-testid="advertiser-onboarding-form">
            {/* ── 1 · account type ─────────────────────────────────────────── */}
            <Section n={1} title="Account type" blurb="Individual, business or organisation — it decides whether a company name is asked, as it does on the phone.">
                <div className="grid grid-cols-2 gap-3">
                    {field(
                        "accountType",
                        "Account type",
                        <Select value={accountType} onValueChange={(v) => chooseAccountType(v as AccountType)}>
                            <SelectTrigger id="af-accountType-input" className="h-9" aria-label="Account type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ACCOUNT_TYPES.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {ACCOUNT_TYPE_LABEL[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>,
                    )}
                    {/* The entity type beside the account type — a row of two selects, the same height; the guidance is the one line under the row. An individual is INDIVIDUAL, so nothing is drawn for one. */}
                    {!individual ? (
                        <div className="space-y-1.5" data-testid="af-entityType">
                            <Label htmlFor="af-entityType-input">Entity type</Label>
                            <Select key={accountType} value={entityType} onValueChange={(v) => setEntityType(v as KycEntityType)}>
                                <SelectTrigger id="af-entityType-input" className="h-9" aria-label="Entity type" aria-invalid={tried && entityProblem ? true : undefined}>
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
                            {tried && entityProblem ? (
                                <p className="text-xs text-danger" role="alert">
                                    {entityProblem}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                    {/* A business or an organisation: the line sits under the account-type row, before the company name and the industry. */}
                    {!individual ? entityLine : null}
                    {!individual
                        ? field("companyName", "Registered company name", text("companyName", { placeholder: "As on the documents", autoComplete: "organization" }))
                        : null}
                    {field("industry", <>Industry {optional}</>, <IndustryPicker id="af-industry-input" value={values.industry} onChange={(industry) => set("industry", industry)} />)}
                    {/* An individual's row is the account type and the industry; the verified rule, when there is one, goes under it. */}
                    {individual ? entityLine : null}
                </div>
            </Section>

            {/* ── 2 · the person ───────────────────────────────────────────── */}
            <Section n={2} title="The person" blurb="Who signs in and books. Their number is the account; the app never asks for the name again. A date of birth is optional — they need to be 18 or over to place orders.">
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
                    {field("dateOfBirth", <>Date of birth {optional}</>, text("dateOfBirth", { type: "date", max: DOB_MAX }))}
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
                {/* The publisher form's "Find the address" bar, without the map — a billing address needs no pin. A pick fills the boxes under it. */}
                <AddressFinder id="af-billing" onPlace={(place) => setValues((v) => withBillingPlace(v, place))} />
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        {field("billingAddress", "Billing address", text("billingAddress", { placeholder: "Building, street, area", autoComplete: "street-address" }))}
                    </div>
                    {field(
                        "city",
                        "City",
                        <CityCombobox id="af-city-input" value={values.city} onChange={(city, picked) => setValues((v) => ({ ...v, city, state: picked ? (picked.geoState?.name ?? picked.state ?? v.state) : v.state }))} placeholder="e.g. Bengaluru" className="[&_input]:h-9" />,
                    )}
                    {field("state", <>State {optional}</>, text("state", { placeholder: "e.g. Karnataka", autoCapitalize: "words" }))}
                    {/* AD-1: a row of two, the same height — the guidance is in the placeholder, not under one cell. */}
                    {field("postalCode", <>PIN code {optional}</>, text("postalCode", { placeholder: "Six digits — 560001", inputMode: "numeric", maxLength: 6, autoComplete: "postal-code" }))}
                    {field("country", <>Country {optional}</>, text("country", { placeholder: "India", maxLength: 60, autoComplete: "country-name", autoCapitalize: "words" }))}
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
                    {ready ? "Everything the app would ask is in." : `${problemCount} field${problemCount === 1 ? "" : "s"} still needed — the app's rules.`}
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

            {/* Phase D: the upgrade is confirmed before it is saved — it fires a fresh Digio request. */}
            <ConfirmDialog
                open={confirmingUpgrade}
                onOpenChange={setConfirmingUpgrade}
                title={`Change the entity type to ${entityTypeLabel(entityType, entityOptions)}?`}
                description={`${ENTITY_UPGRADE_LINE} A fresh Digio request goes out for the business when this is saved.`}
                confirmLabel="Save and restart verification"
                busy={busy}
                onConfirm={() => void save()}
            />
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
