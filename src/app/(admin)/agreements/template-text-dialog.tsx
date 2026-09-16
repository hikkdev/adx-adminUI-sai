"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    KIND_META,
    TEMPLATE_STATE_META,
    versionLabel,
    type AgreementTemplate,
} from "@/services/agreements";

interface TemplateTextDialogProps {
    template: AgreementTemplate | null;
    onOpenChange: (open: boolean) => void;
}

/**
 * A version's text, read-only.
 *
 * Shown as the Markdown source rather than rendered: the console has no
 * Markdown renderer, and for a legal document the source is the more honest
 * view anyway — what the apps render is derived from exactly this.
 */
export function TemplateTextDialog({ template, onOpenChange }: TemplateTextDialogProps) {
    return (
        <Dialog open={template !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                {template && (
                    <>
                        <DialogHeader>
                            <div className="flex flex-wrap items-center gap-2">
                                <DialogTitle>{template.title}</DialogTitle>
                                <StatusBadge status={TEMPLATE_STATE_META[template.state]} />
                            </div>
                            <DialogDescription>
                                {KIND_META[template.kind].label} · {versionLabel(template)}
                                {template.activatedAt
                                    ? ` · live from ${formatDate(template.activatedAt)}`
                                    : " · never live"}
                                {template.retiredAt ? ` · retired ${formatDate(template.retiredAt)}` : ""}
                                {" · "}
                                {template.acceptanceCount === 1
                                    ? "1 acceptance"
                                    : `${template.acceptanceCount} acceptances`}
                            </DialogDescription>
                        </DialogHeader>
                        {template.changeNote && (
                            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">What changed: </span>
                                {template.changeNote}
                            </p>
                        )}
                        <ScrollArea className="max-h-[60vh] rounded-md border">
                            <pre className="whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-6 text-foreground">
                                {template.body}
                            </pre>
                        </ScrollArea>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
