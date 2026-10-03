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
import { CityCombobox } from "@/components/adx/city-combobox";
import { AgentPicker } from "@/components/adx/add-publisher-form";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { deskFieldsFor, formStepsFor, ladderAccountType, type DeskField } from "@/components/adx/flow-renderer";
import { AddressFinder, PIN_CODE, placeFill } from "@/components/adx/pin-picker";
import type { AgentSummary } from "@/services/agents";
import { flowService } from "@/services/flows";
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
import { publishersService, type CreatedPublisher, type PublisherType } from "@/services/publishers";
import type { OnboardingTemplate, Publisher } from "@/types";

/**
 * QR-13 — the desk onboards a publisher the way the app's ladder does.
 *
 * One form, two uses: "Add publisher" (create) and the party page's "Edit
 * details" (edit). FL-3 (27 Sep 2026): its sections are the onboarding
 * ladder's `form` steps for PUBLISHER × the account type — read off
 * `flows.onboarding`, the code ladder when the row holds none — in the
 * ladder's order, under the ladder's titles: the account type, the
 * publisher's details, then for a business or an organisation its
 * information and the contact person. A `form` step names what it is,
 * never its fields; what each collects at the desk is `deskFieldsFor` —
 * the phone's list per step key, the person split into first and last
 * name as the desk stores them. Its required fields are the app's: first
 * and last name, the number, email, address, city, state for everyone
 * (AGE-1: the date of birth is offered, never required — any real date); a GSTIN for a business; a contact person with
 * a number for anyone but an individual. The server applies the same
 * rules (`deskOnboarding`), so what passes here lands.
 *
 * What stays the desk's: the account is opened with the number and the
 * PUBLISHER role up front, the publisher linked to it and — with the
 * basics in — the onboarding marked complete; the address is found with
 * the one "Find the address" bar, whose pick fills the line, the city, the
 * state and the PIN and keeps the coordinates silently (no map, no
 * latitude/longitude — the owner, 1 Oct 2026); an agent may be named for
 * attribution (on nobody's book otherwise). The body is what it always was: `publisherBodyOf`, and
 * the test pins it against the old builder.
 *
 * Phase D (1 Oct 2026): the edit also carries the entity type — what the
 * publisher verifies as, which picks the Digio workflow — beside the
 * account type, and sends it only when the desk changed it. On a VERIFIED
 * publisher the one change the server takes is Individual → a business
 * form; it fires a fresh Digio request and puts the KYC back to pending, so
 * the save is confirmed first. Any other change there is 409 `KYC_LOCKED`,
 * explained under the form, and Digio failing the upgrade is said in the
 * owner's words.
 *
 * DR 08 parity (1 Oct 2026): the account type is the apps' three —
 * Individual, Business, Organisation — and the precise legal form (the
 * entity type) is the select beside it, in the create as in the edit,
 * filtered to the account type's kinds. A school, a college or a ministry
 * is an Organisation · Government or education from the first save. The
 * legacy `type` the backend still keys on is derived from the two choices
 * (`publisherTypeOf`).
 */

/**
 * The legacy `PublisherType` the backend keys on, from DR 08's account type
 * and the entity type: an organisation is POLITICAL when it is a political
 * party or candidate, an NGO otherwise.
 */
export function publisherTypeOf(accountType: AccountType, entityType: KycEntityType | "" | null | undefined): PublisherType {
    if (accountType === "INDIVIDUAL") return "INDIVIDUAL";
    if (accountType === "BUSINESS") return "BUSINESS";
    return entityType === "POLITICAL" ? "POLITICAL" : "NGO";
}

export type Gender = "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";

export const GENDER_LABEL: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other", PREFER_NOT_TO_SAY: "Prefer not to say" };

export interface PublisherFormValues {
    /** DR 08's three. The legacy `type` is derived from it and the entity type (`publisherTypeOf`). */
    accountType: AccountType;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    dateOfBirth: string;
    gender: Gender | "";
    address: string;
    city: string;
    state: string;
    /** The six-digit PIN, filled by the bar's pick or typed. */
    postalCode: string;
    /** Never shown: set by the address bar's pick, kept as the row had them otherwise, and sent with the save. */
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
    accountType: "INDIVIDUAL",
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    dateOfBirth: "",
    gender: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
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
        // INDIVIDUAL → Individual; BUSINESS → Business; NGO and POLITICAL → Organisation.
        accountType: ladderAccountType("PUBLISHER", publisher.type),
        firstName: person?.firstName ?? "",
        lastName: person?.lastName ?? "",
        mobile: publisher.mobile,
        email: publisher.email ?? "",
        dateOfBirth: person?.dateOfBirth ?? "",
        gender: (person?.gender as Gender | null) ?? "",
        address: publisher.address ?? "",
        city: publisher.city ?? "",
        state: publisher.state ?? "",
        postalCode: publisher.postalCode ?? "",
        latitude: publisher.latitude ?? null,
        longitude: publisher.longitude ?? null,
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
    if (values.dateOfBirth.trim()) {
        const problem = dateOfBirthProblem(values.dateOfBirth.trim());
        if (problem) p.dateOfBirth = problem;
    }
    need("address");
    need("city");
    need("state");
    if (values.postalCode.trim() && !PIN_CODE.test(values.postalCode.trim())) p.postalCode = "Six digits, not starting with 0.";
    if (values.accountType !== "INDIVIDUAL") need("name", "The registered name, as on the documents.");
    if (values.accountType === "BUSINESS") need("gstin", "Needed for a business — the app asks for it.");
    if (values.gstin.trim() && !GSTIN.test(values.gstin.trim().toUpperCase())) p.gstin = "A GSTIN is 15 characters, like 22AAAAA0000A1Z5.";
    if (values.accountType !== "INDIVIDUAL") {
        need("contactName", "Needed — who ADX should reach.");
        need("contactMobile", "Needed — their number.");
    }
    if (values.contactMobile.trim() && !MOBILE.test(values.contactMobile.trim())) p.contactMobile = "Ten digits, starting 6 to 9.";
    if (values.contactEmail.trim() && !EMAIL.test(values.contactEmail.trim())) p.contactEmail = "That does not look like an email address.";
    return p;
}

/** The registered name an individual is known by: their own. */
export function registeredName(values: PublisherFormValues): string {
    if (values.accountType === "INDIVIDUAL") return `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
    return values.name.trim();
}

/**
 * The body both writes share — everything the ladder collects, exactly as
 * this form always sent it (`publisher-onboarding-form.test.tsx` pins it
 * against the old builder), the legacy `type` derived from the account type
 * and the entity type chosen. A create adds the number, the attribution and
 * the entity type when one is chosen; an edit adds the entity type only
 * when the desk changed it.
 */
export function publisherBodyOf(values: PublisherFormValues, entityType: KycEntityType | "" = "") {
    return {
        name: registeredName(values),
        email: values.email,
        type: publisherTypeOf(values.accountType, entityType),
        city: values.city,
        firstName: values.firstName,
        lastName: values.lastName,
        dateOfBirth: values.dateOfBirth,
        ...(values.gender ? { gender: values.gender } : {}),
        address: values.address,
        state: values.state,
        postalCode: values.postalCode,
        ...(values.latitude !== null && values.longitude !== null ? { latitude: values.latitude, longitude: values.longitude } : {}),
        gstin: values.gstin.toUpperCase(),
        contactName: values.contactName,
        contactMobile: values.contactMobile,
        contactEmail: values.contactEmail,
    };
}

interface PublisherOnboardingFormProps {
    mode: "create" | "edit";
    /** Edit: the row the form starts from. */
    initial?: PublisherFormValues;
    /** Edit: whose row. */
    publisherId?: string;
    /**
     * Edit — Phase D: the entity type on the row (the effective value, null until one is known), whether the KYC is verified,
     * and whether the value is the stored column rather than read off the legacy type (`entityTypeStored`).
     */
    entity?: { value: KycEntityType | null; verified: boolean; stored?: boolean };
    onCreated?: (publisher: CreatedPublisher) => void;
    onSaved?: () => void;
    onCancel?: () => void;
}

export function PublisherOnboardingForm({ mode, initial, publisherId, entity, onCreated, onSaved, onCancel }: PublisherOnboardingFormProps) {
    const [values, setValues] = React.useState<PublisherFormValues>(initial ?? EMPTY_VALUES);
    /* The account type the form opened on: an edit that moves off it may have to ask the kind again. */
    const [startAccountType] = React.useState<AccountType>(() => (initial ?? EMPTY_VALUES).accountType);
    const storedEntity = entity?.value ?? null;
    /* Phase D: the entity type, beside the values rather than in them — an edit sends it only when changed. Drawn for a business or an organisation; an individual is INDIVIDUAL. */
    const [entityType, setEntityType] = React.useState<KycEntityType | "">(storedEntity ?? "");
    const [confirmingUpgrade, setConfirmingUpgrade] = React.useState(false);
    const entityLists = useApiResource<KycEntityTypeLists>("kyc:entity-types:read", () => kycEntityTypeService.lists());
    const allEntityOptions = (entityLists.data ?? KYC_ENTITY_TYPE_FALLBACK).PUBLISHER;
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
    const [agent, setAgent] = React.useState<AgentSummary | null>(null);
    const [touched, setTouched] = React.useState<Partial<Record<keyof PublisherFormValues, boolean>>>({});
    const [tried, setTried] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [serverErrors, setServerErrors] = React.useState<Record<string, string[]>>({});

    /* FL-3: the ladder the sections come from — the stored template, or the code ladder while it is read or when the row holds none. */
    const template = useApiResource<OnboardingTemplate | null>("flows:onboarding-template", () => flowService.onboardingTemplate().catch(() => null));
    const ladder = formStepsFor(template.data, "PUBLISHER", accountType);

    const set = <K extends keyof PublisherFormValues>(key: K, value: PublisherFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
    const touch = (key: keyof PublisherFormValues) => setTouched((t) => ({ ...t, [key]: true }));

    const problems = React.useMemo(() => problemsOf(values, mode), [values, mode]);
    const problemCount = Object.keys(problems).length + (entityProblem ? 1 : 0);
    const ready = problemCount === 0;

    const shown = (key: keyof PublisherFormValues): string | undefined => serverErrors[key]?.[0] ?? ((tried || touched[key]) ? problems[key] : undefined);

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
        const common = publisherBodyOf(values, chosenEntity);
        try {
            if (mode === "create") {
                // The entity type rides when the desk chose one; an individual's is read off the account type by the server.
                const publisher = await publishersService.create({
                    ...common,
                    mobile: values.mobile,
                    ...(!individual && chosenEntity ? { entityType: chosenEntity } : {}),
                    ...(agent ? { attributeToAgentId: agent.id } : {}),
                });
                toast.success(`${publisher.name} onboarded`, { description: publisher.displayId ?? "Identifier not minted" });
                onCreated?.(publisher);
            } else {
                await publishersService.update(publisherId!, { ...common, ...(entityChanged && chosenEntity ? { entityType: chosenEntity } : {}) });
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

    /* One wrapper per field: the label, the control, the problem under it when there is one — and nothing else, so a row's cells stay the same height. */
    const field = (key: keyof PublisherFormValues, label: React.ReactNode, input: React.ReactNode, wide = false) => (
        <div className={wide ? "col-span-2 space-y-1.5" : "content-start space-y-1.5"} data-testid={`pf-${key}`}>
            <Label htmlFor={`pf-${key}-input`}>{label}</Label>
            {input}
            {shown(key) ? (
                <p className="text-xs text-danger" role="alert">
                    {shown(key)}
                </p>
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
    const labelled = (spec: DeskField): React.ReactNode => (spec.optional ? <>{spec.label} {optional}</> : spec.label);

    /** One desk field by its kind — the phone's kinds (address off the map, the date, the gender pills, the city off the catalogue) with the console's inputs. */
    const draw = (spec: DeskField): React.ReactNode => {
        const key = spec.key as keyof PublisherFormValues;
        switch (spec.kind) {
            case "gender":
                return field(
                    key,
                    labelled(spec),
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
                );
            case "city":
                return field(
                    key,
                    labelled(spec),
                    <CityCombobox id="pf-city-input" value={values.city} onChange={(city) => set("city", city)} stages={["LAUNCHED", "SEEDING"]} placeholder={spec.placeholder ?? "e.g. Bengaluru"} className="[&_input]:h-9" />,
                );
            case "address":
                return field(key, labelled(spec), text(key, { placeholder: spec.placeholder, autoComplete: "street-address" }), true);
            case "date":
                return field(key, labelled(spec), text(key, { type: "date", max: DOB_MAX }));
            case "email":
                return field(key, labelled(spec), text(key, { type: "email", autoComplete: "email", placeholder: spec.placeholder }), spec.wide);
            case "tel":
                return field(
                    key,
                    labelled(spec),
                    text(key, { type: "tel", inputMode: "tel", placeholder: spec.placeholder, ...(key === "mobile" ? { disabled: mode === "edit" } : { maxLength: 10 }) }),
                );
            case "pin":
                return field(key, labelled(spec), text(key, { placeholder: spec.placeholder, inputMode: "numeric", maxLength: 6, autoComplete: "postal-code" }));
            case "gstin":
                return field(key, labelled(spec), text(key, { placeholder: spec.placeholder, maxLength: 15, autoCapitalize: "characters" }));
            default:
                return field(key, labelled(spec), text(key, { placeholder: spec.placeholder, autoCapitalize: key === "name" ? undefined : "words", ...(key === "name" ? { autoComplete: "organization" } : {}) }), spec.wide);
        }
    };

    /** The one "Find the address" bar over the section that carries the address: a pick fills the boxes and keeps the coordinates, never shown. */
    const finder = (
        <AddressFinder
            id="pf-address"
            near={values.latitude !== null && values.longitude !== null ? { latitude: values.latitude, longitude: values.longitude } : null}
            onPlace={(place) => setValues((v) => ({ ...v, ...placeFill(place, v) }))}
        />
    );

    /** The one line of guidance under a section's grid, rather than a hint under one cell of it (the form symmetry policy). */
    const guidance: Record<string, string> = {
        details:
            mode === "edit"
                ? "The number is the identity and is not changed here. A date of birth is optional — they need to be 18 or over to place orders."
                : "The number is what they sign in with — ten digits, starting 6 to 9. A date of birth is optional — they need to be 18 or over to place orders.",
        business: individual ? "" : accountType === "BUSINESS" ? "The GSTIN as printed on the certificate." : "The GSTIN, if registered for GST.",
        contact: "Who ADX should reach about this account; their email is optional.",
    };

    /* The sections in order: the ladder's first rung (the account type), its form steps, and the desk's attribution. Numbered by position. */
    const sections: { key: string; title: string; blurb: string; body: React.ReactNode }[] = [
        {
            key: "account-type",
            title: ladder.accountTypeTitle,
            blurb: "Individual, business or organisation — it decides what else is asked, as it does on the phone.",
            body: (
                <div className="grid grid-cols-2 gap-3">
                    {field(
                        "accountType",
                        "Account type",
                        <Select value={accountType} onValueChange={(v) => chooseAccountType(v as AccountType)}>
                            <SelectTrigger id="pf-accountType-input" className="h-9" aria-label="Account type">
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
                        <div className="content-start space-y-1.5" data-testid="pf-entityType">
                            <Label htmlFor="pf-entityType-input">Entity type</Label>
                            <Select key={accountType} value={entityType} onValueChange={(v) => setEntityType(v as KycEntityType)}>
                                <SelectTrigger id="pf-entityType-input" className="h-9" aria-label="Entity type" aria-invalid={tried && entityProblem ? true : undefined}>
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
                    {entity && (!individual || entity.verified) ? (
                        <p className="col-span-2 text-xs text-muted-foreground" data-testid="pf-entity-rule">
                            The entity type decides which Digio workflow the publisher is verified on. {entity.verified ? ENTITY_VERIFIED_RULE : "While none is chosen, it is asked when verification starts."}
                        </p>
                    ) : !entity && !individual ? (
                        <p className="col-span-2 text-xs text-muted-foreground" data-testid="pf-entity-rule">
                            {ENTITY_CREATE_GUIDANCE}
                        </p>
                    ) : null}
                </div>
            ),
        },
        ...ladder.steps.flatMap((step) => {
            const fields = deskFieldsFor(step.key, accountType, mode);
            if (fields.length === 0) return [];
            // The address bar sits directly above the address, wherever the address falls in the section — so a person's
            // name comes first on every account type, as it does for a business (the owner, 1 Oct 2026).
            const at = fields.findIndex((spec) => spec.kind === "address");
            const withAddress = at >= 0;
            const grid = (specs: DeskField[]) =>
                specs.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                        {specs.map((spec) => (
                            <React.Fragment key={spec.key}>{draw(spec)}</React.Fragment>
                        ))}
                    </div>
                ) : null;
            return [
                {
                    key: step.id,
                    title: step.title,
                    blurb: step.subtitle,
                    body: (
                        <>
                            {grid(withAddress ? fields.slice(0, at) : fields)}
                            {/* The section's guidance is about the fields above the address (the number, the date of birth; the GSTIN) — it stays under them. */}
                            {guidance[step.key] ? <p className="text-xs text-muted-foreground">{guidance[step.key]}</p> : null}
                            {withAddress ? finder : null}
                            {withAddress ? grid(fields.slice(at)) : null}
                        </>
                    ),
                },
            ];
        }),
        ...(mode === "create" ? [{ key: "attribution", title: "Attribution", blurb: "On nobody's book unless an agent is named.", body: <AgentPicker value={agent} onChange={setAgent} /> }] : []),
    ];

    return (
        <form onSubmit={handleSubmit} className="mt-2 flex flex-1 flex-col gap-5" noValidate data-testid="publisher-onboarding-form">
            {sections.map((section, index) => (
                <Section key={section.key} n={index + 1} title={section.title} blurb={section.blurb}>
                    {section.body}
                </Section>
            ))}

            {error && (
                <p className="flex items-start gap-2 text-sm text-danger" role="alert">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                    {ready ? "Everything the app would ask is in." : `${problemCount} field${problemCount === 1 ? "" : "s"} still needed — the app's rules.`}
                    <span className="block text-[11px] text-muted-foreground/80" data-testid="pf-ladder-source">
                        {ladder.source === "config" ? `Sections follow the onboarding ladder${template.data?.version ? ` (v${template.data.version})` : ""}.` : "Sections follow the code's onboarding ladder."}
                    </span>
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
