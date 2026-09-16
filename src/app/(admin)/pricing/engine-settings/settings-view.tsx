"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/adx/section-card";
import { pricingService } from "@/services/pricing";
import { ApiError } from "@/lib/api-client";
import type { PricingSettings } from "@/types/pricing-engine";

interface Props {
    settings: PricingSettings;
    onSaved: () => void;
}

interface FieldSpec {
    key: keyof PricingSettings;
    label: string;
    help: string;
    kind: "int" | "decimal";
    suffix?: string;
}

/**
 * Every number the engine reads, and what moving it actually does.
 *
 * These live in the database rather than in code because each is a figure
 * market research will want to change without a deploy. The help text is not
 * decoration: several of them look interchangeable and are not, and one pair in
 * particular was a single column until sharing it turned out to mean that
 * raising the caveat threshold silently postponed the research-to-ADX handover.
 */
const FIELDS: FieldSpec[] = [
    {
        key: "radiusMeters",
        label: "Comparable radius",
        help: "How far a comparable may be. It deliberately does not widen when the circle is empty — a hoarding two kilometres away is not evidence about this one.",
        kind: "int",
        suffix: "m",
    },
    {
        key: "highEdgePct",
        label: "Too-high edge",
        help: "How close to the top of the range counts as too expensive. 0.05 is within 5% of the highest comparable.",
        kind: "decimal",
    },
    {
        key: "lowEdgePct",
        label: "Cheap-side edge",
        help: "How close to the bottom reads as on the cheaper side. Informational — it never blocks a listing.",
        kind: "decimal",
    },
    {
        key: "minContributors",
        label: "Minimum contributors",
        help: "Below this the indicator says nothing at all rather than guessing.",
        kind: "int",
    },
    {
        key: "thinEvidenceCount",
        label: "Thin-evidence threshold",
        help: 'At or below this many contributors the indicator still appears but admits what it stands on — "based on only 2 nearby spots". Governs a sentence, nothing else.',
        kind: "int",
    },
    {
        key: "validatedTakeoverCount",
        label: "ADX takeover threshold",
        help: "How many ADX listings with a completed campaign it takes before research is dropped from the range entirely. Governs which data decides the price — a different question from the line above, which is why it is a different setting.",
        kind: "int",
    },
    {
        key: "stalenessMonths",
        label: "Staleness window",
        help: "A price older than this is labelled old and its owner nudged. It still counts — stale evidence beats none in a 200 m circle.",
        kind: "int",
        suffix: "months",
    },
    {
        key: "mediaTypeMatchThreshold",
        label: "Media type match threshold",
        help: "Similarity at or above which a proposed media type matches an existing one. Biased low on purpose: two types that should have been one is repairable, a fragmented taxonomy is not.",
        kind: "decimal",
    },
    {
        key: "maxCompoundMultiplier",
        label: "Compounding cap",
        help: "Ceiling on the product of applied multipliers. A listing that hits it is flagged, never silently clamped — the point is to surface the misconfiguration.",
        kind: "decimal",
    },
    {
        key: "maxBindingChangePct",
        label: "Binding change cap",
        help: "The most a BINDING factor may move a listing's rate when a person applies it, as a fraction of the current rate — 0.25 is a quarter either way. Above it the apply is refused and a price case is raised for a person to decide instead. Zero would make every binding factor a price case; one would let a factor double a rate unasked.",
        kind: "decimal",
    },
    {
        key: "sizeTolerancePct",
        label: "Size tolerance",
        help: "How far a measurement may sit from an existing size class and still be filed as that class, as a fraction of each dimension. A size class is a comparable pool, and the listing flow measures rather than picks — with no tolerance, a 20 × 10.5 becomes its own class and an identical spot is never compared to anything. Raise it and genuinely different sizes start sharing a pool.",
        kind: "decimal",
    },
];

export function EngineSettingsView({ settings, onSaved }: Props) {
    const [draft, setDraft] = React.useState<Record<string, string>>(() =>
        Object.fromEntries(FIELDS.map((field) => [field.key, String(settings[field.key])]))
    );
    const [busy, setBusy] = React.useState(false);

    const dirty = FIELDS.some((field) => draft[field.key] !== String(settings[field.key]));

    async function save() {
        setBusy(true);
        try {
            const patch: Record<string, unknown> = {};
            for (const field of FIELDS) {
                const next = draft[field.key] ?? "";
                if (next === String(settings[field.key])) continue;
                patch[field.key] = field.kind === "int" ? Number(next) : next;
            }
            await pricingService.updateSettings(patch as Partial<PricingSettings>);
            toast.success("Engine settings saved", {
                description: "They take effect on the next evaluation — nothing already listed changes.",
            });
            onSaved();
        } catch (cause) {
            toast.error(
                cause instanceof ApiError ? cause.message : "Could not save these settings"
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Engine settings"
            description="One row, read on every evaluation."
            actions={
                <Button onClick={save} disabled={busy || !dirty}>
                    {busy ? "Saving…" : "Save changes"}
                </Button>
            }
        >
            <div className="grid gap-6 md:grid-cols-2">
                {FIELDS.map((field) => (
                    <div key={field.key} className="space-y-2">
                        <Label htmlFor={field.key}>{field.label}</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id={field.key}
                                inputMode={field.kind === "int" ? "numeric" : "decimal"}
                                value={draft[field.key] ?? ""}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        [field.key]: event.target.value,
                                    }))
                                }
                                className="max-w-[10rem] tabular-nums"
                            />
                            {field.suffix && (
                                <span className="text-sm text-muted-foreground">{field.suffix}</span>
                            )}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{field.help}</p>
                    </div>
                ))}
            </div>
        </SectionCard>
    );
}
