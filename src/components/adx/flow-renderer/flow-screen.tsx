"use client";

import * as React from "react";
import { SectionCard } from "@/components/adx/section-card";
import { cn } from "@/lib/utils";
import type { FlowField, FlowScreen } from "@/types";
import { FlowFieldView, fieldSpan, type FieldContext } from "./flow-field";
import { isNumbered, missingFields } from "./flow-model";

/**
 * FL-3 (27 Sep 2026): where the desk's own controls go around the flow.
 * A screen is drawn from the flow; the admin extras — whose spot this is,
 * a standard size picked instead of measured, the attributes the flow does
 * not ask — are slotted after a named field or at the end of a named
 * screen, so the flow stays the flow and the desk's additions stay
 * visibly the desk's.
 */
export interface FlowExtras {
    /** Drawn right after the named field, on its own full row. */
    after?: Record<string, React.ReactNode>;
    /** Drawn at the end of the named screen. */
    screenEnd?: Record<string, React.ReactNode>;
    /** Fields not to draw — the review's attestation, which the submitter ticks on their own phone. */
    skip?: (field: FlowField, screen: FlowScreen) => boolean;
}

/** One screen's fields, in the flow's order, on a two-column grid (one column in the phone frame). */
export function FlowScreenFields({ screen, ctx, extras, className }: { screen: FlowScreen; ctx: FieldContext; extras?: FlowExtras; className?: string }) {
    const columns = ctx.compact ? 1 : 2;
    return (
        <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2", className)} data-testid={`${ctx.idPrefix}-screen-${screen.key}`}>
            {(screen.fields ?? []).map((field) => {
                if (extras?.skip?.(field, screen)) return null;
                const wide = columns === 1 || fieldSpan(field) === 2;
                const after = extras?.after?.[field.id];
                return (
                    <React.Fragment key={field.id}>
                        <div className={cn("content-start", wide && "sm:col-span-2")}>
                            <FlowFieldView field={field} ctx={ctx} />
                        </div>
                        {after ? <div className="sm:col-span-2">{after}</div> : null}
                    </React.Fragment>
                );
            })}
            {extras?.screenEnd?.[screen.key] ? <div className="sm:col-span-2">{extras.screenEnd[screen.key]}</div> : null}
        </div>
    );
}

/**
 * The screens in play as the desk's sections: one card per screen, its
 * title and subtitle the flow's, a "still needed" line on a numbered
 * screen with required fields unanswered. The unnumbered screens — the
 * documents, the review — are drawn too, and gate nothing here: the desk
 * creates a draft, and the publisher's phone is where it is submitted.
 */
export function FlowSections({ screens, ctx, extras, footerOf }: { screens: FlowScreen[]; ctx: FieldContext; extras?: FlowExtras; footerOf?: (screen: FlowScreen) => React.ReactNode }) {
    return (
        <>
            {screens.map((screen) => {
                const missing = isNumbered(screen) ? missingFields(screen, ctx.answers) : [];
                const footer = footerOf?.(screen) ?? (missing.length > 0 ? <p className="text-xs text-warning">Still needed: {missing.join(", ")}</p> : null);
                return (
                    <SectionCard key={screen.key} title={screen.title} description={screen.subtitle} footer={footer}>
                        <FlowScreenFields screen={screen} ctx={ctx} extras={extras} />
                    </SectionCard>
                );
            })}
        </>
    );
}
