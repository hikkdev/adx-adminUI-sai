"use client";

import * as React from "react";
import type { WizardFlow } from "@/types";
import { FlowScreenFields } from "./flow-screen";
import type { FieldContext } from "./flow-field";
import { isNumbered, missingFields, screensInPlay, withAnswer, type FlowAnswers } from "./flow-model";
import { PhoneButton, PhoneFrame, Stepper } from "./phone-frame";
import { EMPTY_VOCABULARIES, type FlowVocabularies } from "./vocabulary";

/**
 * FL-2 (27 Sep 2026): a wizard flow stepped through on a phone, live from
 * the board's draft. The answers are the preview's own — nothing is
 * uploaded or sent — so the operator can branch into "Outdoor", see the
 * venue step narrow, and watch a field they just added appear on the
 * screen they put it on.
 */
export function WizardPreview({ flow, vocab = EMPTY_VOCABULARIES, idPrefix = "preview" }: { flow: WizardFlow; vocab?: FlowVocabularies; idPrefix?: string }) {
    const [answers, setAnswers] = React.useState<FlowAnswers>({});
    const [index, setIndex] = React.useState(0);
    const [pressed, setPressed] = React.useState(false);

    const screens = screensInPlay(flow, answers);
    // The board may remove the screen the preview is on; the index follows the flow rather than pointing past it.
    const current = Math.min(index, Math.max(screens.length - 1, 0));
    const screen = screens[current] ?? null;
    const branching = Object.keys(flow.branches ?? {}).length > 0;
    const category = (() => {
        const field = flow.screens.flatMap((item) => item.fields).find((item) => item.branching);
        const value = field ? answers[field.id] : undefined;
        return typeof value === "string" ? value : null;
    })();

    const ctx: FieldContext = {
        answers,
        set: (id, value) => setAnswers((state) => withAnswer(flow, state, id, value)),
        vocab,
        category,
        idPrefix,
        compact: true,
    };

    if (!screen) {
        return (
            <PhoneFrame caption="No screens yet">
                <p className="py-10 text-center text-sm text-muted-foreground">Add a screen on the board and it appears here.</p>
            </PhoneFrame>
        );
    }

    const missing = missingFields(screen, answers);
    const atStart = current === 0;
    const atEnd = current >= screens.length - 1;
    // Before a category is chosen the branch has no screens, so the first step is also the last; it is not the review until there is a branch.
    const isReview = atEnd && !(branching && category === null);

    return (
        <PhoneFrame
            caption={`${screen.key} · ${current + 1} of ${screens.length} in play`}
            footer={
                <div className="space-y-2">
                    {missing.length > 0 && <p className="text-xs text-warning">Still needed: {missing.join(", ")}</p>}
                    {pressed && isReview && <p className="text-xs text-muted-foreground">This is where the phone submits. Nothing is sent from a preview.</p>}
                    <PhoneButton
                        label={screen.ctaLabel}
                        disabled={missing.length > 0}
                        onClick={() => {
                            if (isReview) setPressed(true);
                            else setIndex(current + 1);
                        }}
                    />
                    <PhoneButton
                        label={atStart ? "Cancel" : "Back"}
                        secondary
                        onClick={() => {
                            setPressed(false);
                            if (atStart) setAnswers({});
                            else setIndex(current - 1);
                        }}
                    />
                </div>
            }
        >
            <div className="space-y-4">
                {isNumbered(screen) ? (
                    <Stepper step={screen.step} total={screen.totalSteps} name={screen.title} />
                ) : screen.badge ? (
                    <p className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{screen.badge}</p>
                ) : null}
                <div>
                    <h3 className="text-lg font-semibold leading-tight text-foreground">{screen.title}</h3>
                    {screen.subtitle && <p className="mt-1 text-sm text-muted-foreground">{screen.subtitle}</p>}
                </div>
                <FlowScreenFields screen={screen} ctx={ctx} />
            </div>
        </PhoneFrame>
    );
}
