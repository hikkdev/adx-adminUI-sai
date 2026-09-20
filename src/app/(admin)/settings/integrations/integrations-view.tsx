"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { useAuth } from "@/lib/auth";
import {
    SECRET_FIELDS,
    emailModeOf,
    integrationsService,
    isMasked,
    sectionPatch,
    type IntegrationSection,
    type IntegrationsSettings,
} from "@/services/integrations";
import type { SmsVocabulary } from "@/services/comms";
import type { StatusMeta } from "@/types";
import { DigioSection } from "./digio-section";
import { EmailModeControl, SMTP_HOST_FIELDS } from "./email-door";
import { EmailDoorCard, SmsRoutingCard, ThirdRailCard, railBadges } from "./messaging-section";
import { AudienceSection } from "./audience-section";
import { MapsSection } from "./maps-section";
import { PushSection } from "./push-section";
import { QrEngineSection } from "./qr-engine-section";
import { StaffToolsSection } from "./staff-tools-section";

interface IntegrationsViewProps {
    settings: IntegrationsSettings;
    /** E10-2: the DLT kinds and the rail names, from `GET /comms/sms-kinds`. */
    sms: SmsVocabulary;
    onChanged: () => void;
}

interface FieldSpec {
    key: string;
    label: string;
    placeholder?: string;
    /** Masked on read; blank on save keeps the stored value. */
    secret?: boolean;
    type?: "text" | "number";
}

interface SectionSpec {
    section: IntegrationSection;
    name: string;
    helper: string;
    fields: FieldSpec[];
    /** Lot C (Q110): the sandbox switch the gateways carry. */
    testMode?: { helper: string };
    /** Which field says the rail is configured at all. */
    configuredBy: string;
}

const GATEWAYS: SectionSpec[] = [
    {
        section: "razorpay",
        name: "Razorpay",
        helper: "Cards, UPI and netbanking for campaign and package payments. Goes live first.",
        configuredBy: "keyId",
        fields: [
            { key: "keyId", label: "Key ID", placeholder: "rzp_live_…" },
            { key: "keySecret", label: "Key secret", secret: true },
            { key: "webhookSecret", label: "Webhook secret", secret: true },
        ],
        testMode: { helper: "The key prefix (rzp_test_ / rzp_live_) decides the host; the flag is the console's record." },
    },
    {
        section: "cashfree",
        name: "Cashfree PG",
        helper: "Payment gateway — distinct from the Cashfree payouts rail under Finance settings.",
        configuredBy: "appId",
        fields: [
            { key: "appId", label: "App ID" },
            { key: "secretKey", label: "Secret key", secret: true },
            { key: "webhookSecret", label: "Webhook secret (optional)", secret: true },
        ],
        testMode: { helper: "sandbox.cashfree.com while on, api.cashfree.com off. Ships on until the live credentials arrive." },
    },
    {
        section: "ccavenue",
        name: "CCAvenue",
        helper: "Redirect flow — the encrypted request is built here, the response posted back is the webhook.",
        configuredBy: "merchantId",
        fields: [
            { key: "merchantId", label: "Merchant ID" },
            { key: "accessCode", label: "Access code", secret: true },
            { key: "workingKey", label: "Working key", secret: true },
        ],
        testMode: { helper: "test.ccavenue.com while on, secure.ccavenue.com off. Ships on until the live credentials arrive." },
    },
];

/** Lot E (Q128): the two wired SMS rails. The third is a seam with no keys; the routing table below names all three. */
const SMS_RAILS: (SectionSpec & { rail: "msg91" | "twilio" })[] = [
    {
        section: "sms",
        rail: "msg91",
        name: "MSG91",
        helper: "Flow API — the kind's flow id and named variables; MSG91 renders. Delivery reports post to /webhooks/msg91.",
        configuredBy: "authKey",
        fields: [{ key: "authKey", label: "Auth key", secret: true }],
    },
    {
        section: "twilio",
        rail: "twilio",
        name: "Twilio",
        helper: "Messages API — the registered text with the DLT ids in the form. Status callbacks are signature-checked and fail closed without the token.",
        configuredBy: "accountSid",
        fields: [
            { key: "accountSid", label: "Account SID", placeholder: "AC…" },
            { key: "authToken", label: "Auth token", secret: true },
            { key: "phoneNumber", label: "From number", placeholder: "+1…" },
        ],
    },
];

/** Lot E (Q87): the two email doors; the switch between them sits beside the forms. */
const EMAIL_DOORS: SectionSpec[] = [
    {
        section: "email",
        name: "SMTP",
        helper: "Transactional email — invitations, sign-in codes, statements, announcements.",
        configuredBy: "host",
        fields: [
            { key: "host", label: "Host", placeholder: "smtp.example.com" },
            { key: "port", label: "Port", type: "number", placeholder: "587" },
            { key: "user", label: "User" },
            { key: "password", label: "Password", secret: true },
            { key: "from", label: "From address", placeholder: "ADX <no-reply@adx.in>" },
        ],
    },
    {
        section: "resend",
        name: "Resend",
        helper: "The hosted door. Used when chosen as primary, or by default when it is the only one with a key on file.",
        configuredBy: "apiKey",
        fields: [
            { key: "apiKey", label: "API key", secret: true },
            { key: "fromEmail", label: "From address", placeholder: "no-reply@adx.in" },
        ],
    },
];

/**
 * Settings › Integrations, live over `GET/PUT /integrations`.
 *
 * The frame's "Connected services" cards are these: each rail with its
 * connected chip and its credentials, the three gateways with the test-mode
 * switch beside them (Lot C, Q110), the SMS routing table and the email
 * door (Lot E, Q87/Q128), and the two staff tools — the HR tool (Q98) and
 * the work tool (E10-1) — side by side. Secrets arrive masked and never
 * round-trip — a blank field on save keeps what is stored.
 *
 * Lot G (package CG4, Q132): the Google Maps card became the maps seam —
 * provider Google | Mapbox with the browser / public key and the server
 * key, all masked — and an Audience data section sits beside it, both
 * over the same `/integrations` row; Y-C made it two vendor switches
 * (GeoIQ and Azira at once) with the blend policy between them. A Push card
 * says whether FCM is configured as far as any read tells it, never the
 * secret. The frame's API keys and Webhooks tables are removed with the
 * decision (Q131): the console has no API-key issuance and no outbound
 * webhook registry — the backend's webhooks are the rails' inbound
 * callbacks, verified by signature, not endpoints ops register — so a
 * table of either would be rows nothing serves.
 */
export function IntegrationsView({ settings, sms, onChanged }: IntegrationsViewProps) {
    const { user } = useAuth();
    /* AE-C: under the Ethereal mode the host fields collapse; the door counts as connected because the inbox stands in for the host. */
    const ethereal = emailModeOf(settings.email) === "ETHEREAL";
    return (
        <div className="space-y-5">
            <PageHeader
                title="Integrations and API keys"
                subtitle="Keys and connected services powering the exchange. Secrets are stored once and shown masked."
            />

            <SectionCard
                title="Payment gateways"
                description="Money arriving from advertisers. A capture tops up the wallet; the register is under Finance › Payments."
            >
                <div className="grid gap-4 lg:grid-cols-3">
                    {GATEWAYS.map((spec) => (
                        <SectionForm
                            // Keyed on the stored values so a save's re-read remounts the form on the server's masks.
                            key={`${spec.section}:${JSON.stringify(settings[spec.section] ?? null)}`}
                            spec={spec}
                            stored={storedOf(settings, spec.section)}
                            onChanged={onChanged}
                        />
                    ))}
                </div>
            </SectionCard>

            <SectionCard
                title="SMS rails"
                description="Every SMS names a DLT-registered kind; the rail in use renders it from its own registration. Keys per rail, then the routing table they share."
            >
                <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-3">
                        {SMS_RAILS.map((spec) => (
                            <SectionForm
                                // Keyed on the stored values so a save's re-read remounts the form on the server's masks.
                                key={`${spec.section}:${JSON.stringify(settings[spec.section] ?? null)}`}
                                spec={spec}
                                stored={storedOf(settings, spec.section)}
                                badges={railBadges(settings.sms, spec.rail)}
                                onChanged={onChanged}
                            />
                        ))}
                        {/* Every rail the server names beyond the two wired ones: a seam with no keys, drawn so its name has a face. */}
                        {sms.rails
                            .filter((rail) => !SMS_RAILS.some((spec) => spec.rail === rail))
                            .map((rail) => (
                                <ThirdRailCard key={rail} rail={rail} sms={settings.sms} />
                            ))}
                    </div>
                    <SmsRoutingCard key={JSON.stringify(settings.sms ?? null)} sms={settings.sms} vocabulary={sms} onChanged={onChanged} />
                </div>
            </SectionCard>

            <SectionCard title="Email" description="The two doors outbound email can leave by, which one the dispatcher uses, and a test message through it.">
                <div className="grid gap-4 lg:grid-cols-3">
                    {EMAIL_DOORS.map((spec) => (
                        <SectionForm
                            key={`${spec.section}:${JSON.stringify(settings[spec.section] ?? null)}`}
                            spec={spec}
                            stored={storedOf(settings, spec.section)}
                            onChanged={onChanged}
                            // AE-C: the SMTP door carries its mode; under Ethereal the host fields collapse and the door is connected by the inbox.
                            head={spec.section === "email" ? <EmailModeControl email={settings.email} onChanged={onChanged} /> : undefined}
                            hidden={spec.section === "email" && ethereal ? SMTP_HOST_FIELDS : undefined}
                            configured={spec.section === "email" && ethereal ? true : undefined}
                            badges={spec.section === "email" && ethereal ? [{ label: "Test inbox", tone: "warning" }] : undefined}
                        />
                    ))}
                    <EmailDoorCard
                        email={settings.email}
                        resend={settings.resend}
                        smtpConfigured={Boolean(settings.email?.host)}
                        resendConfigured={Boolean(settings.resend?.apiKey)}
                        operatorEmail={user?.email ?? null}
                        onChanged={onChanged}
                    />
                </div>
            </SectionCard>

            {/* The frame's Google Maps Platform card, as the maps seam (G7): provider and the two key pairs, masked. */}
            <MapsSection stored={settings.maps} onChanged={onChanged} />

            {/* G7 (Q109) / Y-C: the audience vendors — both switches off until ops choose — and the policy that blends them. */}
            <AudienceSection stored={settings.audience} onChanged={onChanged} />

            {/* QR-1: the QR engine — Local, or GenQR for styled print artwork and hosted hoarding codes. */}
            <QrEngineSection stored={settings.qrEngine} onChanged={onChanged} />

            {/* QR-9: DR 11's brand — the wordmark, the mark, the reds — retuned here, drawn everywhere. */}

            {/* G6 (Q103/133): push through FCM — the configured state as far as any read carries it. */}
            <PushSection push={settings.push} />

            {/* Lot E (Q98) and E10-1: the HR tool and the work tool the employees overview links out to. */}
            <StaffToolsSection hrms={settings.hrms} workTool={settings.workTool} onChanged={onChanged} />

            {/* Lot D (Q129): the KYC provider switch — DIGIO / MANUAL by ops, DEGRADED by the probe. */}
            <DigioSection />
        </div>
    );
}

type Stored = Record<string, string | number | boolean | null> | undefined;

/** A section as a plain record — the forms read fields by key. */
const storedOf = (settings: IntegrationsSettings, section: IntegrationSection): Stored =>
    settings[section] as unknown as Stored;

function SectionForm({
    spec,
    stored,
    badges = [],
    head,
    hidden = [],
    configured: configuredOverride,
    onChanged,
}: {
    spec: SectionSpec;
    stored: Stored;
    /** Extra chips beside the connected state — a rail's place in the routing order. */
    badges?: StatusMeta[];
    /** AE-C: a control drawn above the fields — the SMTP door's mode. */
    head?: React.ReactNode;
    /** AE-C: fields not drawn in the current state — the SMTP host fields under the Ethereal mode. A typed value still travels if it changed. */
    hidden?: readonly string[];
    /** AE-C: the connected state when something other than `configuredBy` decides it. */
    configured?: boolean;
    onChanged: () => void;
}) {
    const initial = React.useMemo(() => {
        const typed: Record<string, string | boolean> = {};
        for (const field of spec.fields) {
            const value = stored?.[field.key];
            // A masked secret is shown as its mask and cleared on focus; a
            // plain value is editable as it stands.
            typed[field.key] = value === null || value === undefined ? "" : String(value);
        }
        if (spec.testMode) typed.testMode = Boolean(stored?.testMode);
        return typed;
    }, [spec, stored]);

    const [typed, setTyped] = React.useState<Record<string, string | boolean>>(initial);
    const [busy, setBusy] = React.useState(false);
    const patch = sectionPatch(spec.section, typed, stored);
    const dirty = Object.keys(patch).length > 0;
    const configured = configuredOverride ?? Boolean(stored?.[spec.configuredBy]);

    const save = async () => {
        setBusy(true);
        try {
            await integrationsService.update(spec.section, patch);
            toast.success(`${spec.name} saved`, {
                description: `${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"} updated. The audit trail records the names, never the values.`,
            });
            onChanged();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : `Could not save ${spec.name}.`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{spec.name}</p>
                        <StatusBadge
                            status={configured ? { label: "Connected", tone: "success" } : { label: "Not connected", tone: "neutral" }}
                        />
                        {badges.map((badge) => (
                            <StatusBadge key={badge.label} status={badge} />
                        ))}
                        {spec.testMode && typeof stored?.testMode === "boolean" && (
                            <StatusBadge status={stored.testMode ? { label: "Test mode", tone: "warning" } : { label: "Live", tone: "info" }} />
                        )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{spec.helper}</p>
                </div>
            </div>

            <div className="space-y-2.5">
                {head}
                {spec.fields.filter((field) => !hidden.includes(field.key)).map((field) => {
                    const id = `${spec.section}-${field.key}`;
                    const value = typed[field.key];
                    const masked = typeof value === "string" && isMasked(value);
                    return (
                        <div key={field.key} className="space-y-1">
                            <Label htmlFor={id} className="text-xs">
                                {field.label}
                            </Label>
                            <Input
                                id={id}
                                type={field.type ?? "text"}
                                value={typeof value === "string" ? value : ""}
                                placeholder={field.placeholder}
                                autoComplete="off"
                                className={masked ? "font-mono text-muted-foreground" : undefined}
                                onFocus={() => {
                                    if (masked) setTyped((current) => ({ ...current, [field.key]: "" }));
                                }}
                                onBlur={() => {
                                    // Left blank after clearing a mask: the stored secret stays; show the mask again.
                                    if (field.secret && typeof typed[field.key] === "string" && !(typed[field.key] as string).trim()) {
                                        setTyped((current) => ({ ...current, [field.key]: String(stored?.[field.key] ?? "") }));
                                    }
                                }}
                                onChange={(event) => setTyped((current) => ({ ...current, [field.key]: event.target.value }))}
                            />
                            {field.secret && SECRET_FIELDS[spec.section].includes(field.key) && (
                                <p className="text-[11px] text-muted-foreground">
                                    {stored?.[field.key] ? "Stored. Type a new value to replace it; leave it to keep it." : "Not set."}
                                </p>
                            )}
                        </div>
                    );
                })}
                {spec.testMode && (
                    <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 p-3">
                        <div className="min-w-0">
                            <Label htmlFor={`${spec.section}-testMode`} className="text-xs">
                                Test mode
                            </Label>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{spec.testMode.helper}</p>
                        </div>
                        <Switch
                            id={`${spec.section}-testMode`}
                            checked={Boolean(typed.testMode)}
                            onCheckedChange={(checked) => setTyped((current) => ({ ...current, testMode: checked }))}
                        />
                    </div>
                )}
            </div>

            <div className="mt-auto flex items-center justify-end gap-2 pt-1">
                {dirty && (
                    <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setTyped(initial)}>
                        Discard
                    </Button>
                )}
                <Button size="sm" className="h-8" disabled={!dirty || busy} onClick={save}>
                    Save {spec.name}
                </Button>
            </div>
        </div>
    );
}
