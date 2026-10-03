"use client";

import * as React from "react";
import { Eye, EyeOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EMPTY_VOCABULARIES, LadderPreview, StepsPreview, WizardPreview, type FlowVocabularies } from "@/components/adx/flow-renderer";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { campaignService } from "@/services/campaigns";
import { pricingService } from "@/services/pricing";
import type { OnboardingTemplate, StepLadder, TemplateAccountType, TemplateParty, WizardFlow } from "@/types";

/**
 * FL-2 (27 Sep 2026): the phone beside the board.
 *
 * The board holds its draft in state and passes it down; the preview
 * redraws on every keystroke and saves nothing. A wizard is stepped
 * through live — its taxonomy fields read the real vocabularies when the
 * console is on the API, and draw their empty notes otherwise; the
 * onboarding ladder follows the board's party and account type; a step
 * ladder follows the board's selected step. The panel can be folded away
 * on a narrow screen; it is open by default because seeing the screen is
 * the point.
 */
type PreviewProps =
    | { shape: "wizard"; flow: WizardFlow }
    | { shape: "ladder"; template: OnboardingTemplate; party: TemplateParty; accountType: TemplateAccountType }
    | { shape: "steps"; ladder: StepLadder; proofLabel: (key: string) => string; selectedKey: string | null; onSelect: (key: string) => void };

export function FlowPreviewPanel(props: PreviewProps) {
    const [open, setOpen] = React.useState(true);
    return (
        <Card className="h-fit rounded-lg border-border shadow-none xl:sticky xl:top-4" data-testid="flow-preview">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                    On a phone
                </h2>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setOpen((current) => !current)} aria-label={open ? "Hide the preview" : "Show the preview"}>
                    {open ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
            </div>
            {open ? (
                <div className="bg-muted/40 p-4">
                    <p className="mb-3 text-center text-xs text-muted-foreground">Drawn from the board as it stands, saved or not. Nothing typed here is sent.</p>
                    {props.shape === "wizard" ? (
                        <WizardPanel flow={props.flow} />
                    ) : props.shape === "ladder" ? (
                        <LadderPreview key={`${props.party}:${props.accountType}`} template={props.template} party={props.party} accountType={props.accountType} />
                    ) : (
                        <StepsPreview ladder={props.ladder} proofLabel={props.proofLabel} selectedKey={props.selectedKey} onSelect={props.onSelect} />
                    )}
                </div>
            ) : (
                <p className="px-4 py-3 text-xs text-muted-foreground">Hidden. Show it to step through the flow on a 390-pixel phone.</p>
            )}
        </Card>
    );
}

/** The wizard with the real vocabularies under its taxonomy fields, read once; an offline console draws the fields' own empty notes. */
function WizardPanel({ flow }: { flow: WizardFlow }) {
    const live = isLive("pricingEngine");
    const vocab = useApiResource<FlowVocabularies>(`flows:preview-vocabularies:${live}`, async () => {
        if (!live) return EMPTY_VOCABULARIES;
        const [venues, mediaTypes, sizeClasses, materials, contentCategories] = await Promise.all([
            pricingService.venueTypes().catch(() => []),
            pricingService.mediaTypes().catch(() => []),
            pricingService.sizeClasses().catch(() => []),
            pricingService.materials().catch(() => []),
            campaignService.contentCategories().catch(() => []),
        ]);
        return { venues, mediaTypes, sizeClasses, materials, contentCategories };
    });
    return <WizardPreview flow={flow} vocab={vocab.data ?? EMPTY_VOCABULARIES} />;
}
