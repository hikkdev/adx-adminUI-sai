"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StepLadder } from "@/types";
import { PhoneButton, PhoneFrame, Stepper } from "./phone-frame";

/**
 * FL-2 (27 Sep 2026): a step ladder as the phone shows it — the agent
 * job's A1–A8, the intake desk's ladder, the invite landing's copy: the
 * counter, the title and the line under it, the hint as bullets when it
 * has several lines, the proofs the step collects as an unticked
 * checklist, and the button. The board's selected step is the one shown
 * when the board says which; otherwise the preview keeps its own place.
 */
export function StepsPreview({ ladder, proofLabel, selectedKey, onSelect }: { ladder: StepLadder; proofLabel: (key: string) => string; selectedKey?: string | null; onSelect?: (key: string) => void }) {
    const [own, setOwn] = React.useState(0);
    const steps = ladder.steps ?? [];
    const selectedIndex = selectedKey ? steps.findIndex((step) => step.key === selectedKey) : -1;
    const current = Math.min(selectedIndex >= 0 ? selectedIndex : own, Math.max(steps.length - 1, 0));
    const step = steps[current] ?? null;
    const maxNumber = steps.reduce((max, item) => Math.max(max, item.number), 0);

    const go = (next: number) => {
        setOwn(next);
        const target = steps[next];
        if (target && onSelect) onSelect(target.key);
    };

    if (!step) {
        return (
            <PhoneFrame caption="Empty ladder">
                <p className="py-10 text-center text-sm text-muted-foreground">This ladder has no steps yet. Add one on the board and it appears here.</p>
            </PhoneFrame>
        );
    }

    const hintLines = (step.hint ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={current === 0} onClick={() => go(current - 1)} aria-label="Previous step">
                    <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                    <code>{step.key}</code> · {current + 1} of {steps.length}
                </span>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={current >= steps.length - 1} onClick={() => go(current + 1)} aria-label="Next step">
                    <ChevronRight className="size-4" />
                </Button>
            </div>
            <PhoneFrame footer={<PhoneButton label={step.cta || "Continue"} />}>
                <div className="space-y-4" data-testid={`steps-preview-${step.key}`}>
                    <Stepper step={step.number} total={maxNumber} name={step.title} />
                    <div>
                        <h3 className="text-lg font-semibold leading-tight text-foreground">{step.title}</h3>
                        {step.subtitle && <p className="mt-1 text-sm text-muted-foreground">{step.subtitle}</p>}
                    </div>
                    {hintLines.length > 1 ? (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                            {hintLines.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    ) : hintLines[0] ? (
                        <p className="text-sm text-muted-foreground">{hintLines[0]}</p>
                    ) : null}
                    {(step.proofs ?? []).length > 0 ? (
                        <ul className="divide-y rounded-lg border bg-card">
                            {step.proofs.map((proof, i) => (
                                <li key={`${proof.key}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-foreground">{proofLabel(proof.key)}</span>
                                        <span className="block text-xs text-muted-foreground">{proof.label}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-muted-foreground">This step only explains; it collects nothing.</p>
                    )}
                </div>
            </PhoneFrame>
        </div>
    );
}
