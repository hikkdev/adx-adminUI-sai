"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, FileText, Info, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OnboardingStep, OnboardingTemplate, OnboardingTile, TemplateAccountType, TemplateParty } from "@/types";
import { PhoneButton, PhoneFrame, Stepper } from "./phone-frame";

/**
 * FL-2 (27 Sep 2026): the onboarding ladder as the phone climbs it — the
 * steps of one party × account type from the board's draft template,
 * each drawn the way its kind's screen draws it: the account-type cards,
 * a form step's fields, the KYC intro's bands, a capture step's tiles
 * (an inert one muted, a conditional one saying when it shows), the
 * checklist and the agreement. Nothing is typed or uploaded here.
 */

const ACCOUNT_TYPE_CARDS: { id: TemplateAccountType; title: string; description: string }[] = [
    { id: "INDIVIDUAL", title: "Individual", description: "A person listing their own space" },
    { id: "BUSINESS", title: "Business", description: "A registered business with a GSTIN" },
    { id: "ORGANISATION", title: "Organisation", description: "An NGO, a trust, a political body" },
];

/** The phone's own field list per form step (`form-step.tsx`'s `fieldsFor`), for the look. */
function phoneFormFields(stepKey: string, accountType: TemplateAccountType): { label: string; hint?: string }[] {
    const person = accountType === "INDIVIDUAL";
    const address = [{ label: "Address" }, { label: "City" }, { label: "State" }];
    const personDetails = [{ label: "Date of birth", hint: "You need to be 18 or over to list on ADX." }, { label: "Gender" }];
    switch (stepKey) {
        case "details":
            return [{ label: person ? "Full name, as on your ID" : "Registered name, as on your documents" }, { label: "Email" }, ...(person ? [...address, ...personDetails] : personDetails)];
        case "business":
            return [{ label: "GSTIN", hint: accountType === "BUSINESS" ? "As printed on your GST certificate" : "If registered for GST" }, { label: "Registered address" }, { label: "City" }, { label: "State" }];
        case "contact":
            return [{ label: "Contact person" }, { label: "Their mobile number" }, { label: "Their email" }];
        default:
            return [];
    }
}

export function LadderPreview({ template, party, accountType }: { template: OnboardingTemplate; party: TemplateParty; accountType: TemplateAccountType }) {
    const ids = template.ladders?.[party]?.[accountType] ?? [];
    const steps = ids.map((id) => ({ id, step: template.steps?.[id] ?? null }));
    const [index, setIndex] = React.useState(0);
    const current = Math.min(index, Math.max(steps.length - 1, 0));
    const entry = steps[current];
    const total = steps.length;

    if (!entry) {
        return (
            <PhoneFrame caption="Empty ladder">
                <p className="py-10 text-center text-sm text-muted-foreground">This ladder has no steps yet. Add one on the board and it appears here.</p>
            </PhoneFrame>
        );
    }

    const nav = (
        <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={current === 0} onClick={() => setIndex(current - 1)} aria-label="Previous step">
                <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
                <code>{entry.id}</code> · {current + 1} of {total}
            </span>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={current >= total - 1} onClick={() => setIndex(current + 1)} aria-label="Next step">
                <ChevronRight className="size-4" />
            </Button>
        </div>
    );

    return (
        <div className="space-y-2">
            {nav}
            <PhoneFrame footer={entry.step ? <PhoneButton label={ctaOf(entry.step)} /> : undefined}>
                {entry.step ? <LadderStepView step={entry.step} stepNumber={current + 1} total={total} accountType={accountType} /> : <p className="py-10 text-center text-sm text-danger">&ldquo;{entry.id}&rdquo; is named on the ladder but not in the library.</p>}
            </PhoneFrame>
        </div>
    );
}

function ctaOf(step: OnboardingStep): string {
    if ("cta" in step && step.cta) return step.cta;
    return step.kind === "form" ? "Save & continue" : "Continue";
}

function LadderStepView({ step, stepNumber, total, accountType }: { step: OnboardingStep; stepNumber: number; total: number; accountType: TemplateAccountType }) {
    return (
        <div className="space-y-4" data-testid={`ladder-preview-${step.kind}`}>
            <Stepper step={stepNumber} total={total} name={step.title} />
            <div>
                <h3 className="text-lg font-semibold leading-tight text-foreground">{step.title}</h3>
                {"subtitle" in step && step.subtitle && <p className="mt-1 text-sm text-muted-foreground">{step.subtitle}</p>}
            </div>
            {step.kind === "account-type" && (
                <div className="space-y-2">
                    {ACCOUNT_TYPE_CARDS.map((card) => (
                        <div key={card.id} className={cn("rounded-lg border px-3.5 py-3", card.id === accountType ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card")}>
                            <p className="text-sm font-medium text-foreground">{card.title}</p>
                            <p className="text-xs text-muted-foreground">{card.description}</p>
                        </div>
                    ))}
                </div>
            )}
            {step.kind === "form" && (
                <div className="space-y-3">
                    {phoneFormFields(step.key, accountType).map((field) => (
                        <div key={field.label} className="space-y-1">
                            <p className="text-xs font-medium text-foreground">{field.label}</p>
                            <div className="h-10 rounded-md border border-border bg-card" />
                            {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                        </div>
                    ))}
                    {phoneFormFields(step.key, accountType).length === 0 && <p className="text-xs text-muted-foreground">The phone has no field list for a &ldquo;{step.key}&rdquo; step; it draws the title alone.</p>}
                </div>
            )}
            {step.kind === "kyc-intro" && (
                <ul className="divide-y rounded-lg border bg-card">
                    {step.bands.map((band, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                            <span className="font-medium text-foreground">{band.label}</span>
                            <span className="text-right text-muted-foreground">{band.value}</span>
                        </li>
                    ))}
                </ul>
            )}
            {step.kind === "capture" && (
                <div className="space-y-3">
                    {step.text && (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground">{step.text.label}</p>
                            <div className="flex h-10 items-center rounded-md border border-border bg-card px-3 font-mono text-xs text-muted-foreground">{step.text.pattern}</div>
                            {step.text.hint && <p className="text-[11px] text-muted-foreground">{step.text.hint}</p>}
                        </div>
                    )}
                    {(step.guidance ?? []).map((tip, i) => (
                        <div key={i} className="space-y-1">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{tip.label}</p>
                            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                {tip.hint}
                            </div>
                        </div>
                    ))}
                    {step.documents.length > 1 && <p className="text-[11px] text-muted-foreground">One of these:</p>}
                    {step.documents.map((tile) => (
                        <TileView key={tile.key} tile={tile} />
                    ))}
                    {step.skippableWhen && (
                        <p className="text-[11px] text-muted-foreground">
                            Skippable when the government id is {step.skippableWhen.value}.
                        </p>
                    )}
                </div>
            )}
            {(step.kind === "checklist" || step.kind === "review") && (
                <ul className="space-y-2">
                    {["Government ID", "PAN card", "Address proof", "Selfie", "Video"].map((item) => (
                        <li key={item} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm">
                            <span className="text-foreground">{item}</span>
                            <span className="text-xs text-muted-foreground">Retake</span>
                        </li>
                    ))}
                </ul>
            )}
            {step.kind === "agreement" && (
                <div className="space-y-2 rounded-md border bg-card p-3 text-xs text-muted-foreground">
                    <p>The published agreement{step.agreementKey ? ` (${step.agreementKey})` : ""} is drawn here, scrollable, with the acceptance at its foot.</p>
                </div>
            )}
        </div>
    );
}

function TileView({ tile }: { tile: OnboardingTile }) {
    return (
        <div className="space-y-1" data-testid={`ladder-preview-tile-${tile.key}`}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
            <div className={cn("rounded-md border-2 border-dashed px-3 py-4 text-center", tile.inert ? "border-border bg-muted/40 opacity-70" : "border-border bg-card")}>
                {tile.video ? <Video className="mx-auto size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden /> : <FileText className="mx-auto size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />}
                <p className="mt-1.5 text-xs text-muted-foreground">{tile.hint || (tile.source === "camera" ? "Opens the camera" : "Tap to browse")}</p>
                {tile.pdf && !tile.inert && <p className="mt-1 text-[11px] text-primary">Choose a file · PDF or image</p>}
            </div>
            {(tile.onlyWhen || tile.sets) && (
                <p className="text-[11px] text-muted-foreground">
                    {tile.onlyWhen ? `Only when the id is ${tile.onlyWhen.value}. ` : ""}
                    {tile.sets ? `Choosing it sets ${tile.sets.field} = ${tile.sets.value}.` : ""}
                </p>
            )}
        </div>
    );
}
