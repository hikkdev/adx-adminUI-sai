"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readPendingDocuments } from "@/services/document-reading";

type ReadableCase = Parameters<typeof readPendingDocuments>[0][number];

/**
 * DR-1, on every KYC queue whose rows carry their documents: every document
 * on an open manual case, read through the model, so each case opens with
 * its fields already there. A reading is a prefill and a cross-check, never
 * a decision.
 */
export function ReadPendingButton({ cases, disabled = false }: { cases: ReadableCase[]; disabled?: boolean }) {
    const [reading, setReading] = React.useState(false);

    const readPending = async () => {
        setReading(true);
        try {
            const outcome = await readPendingDocuments(cases);
            if (outcome.attempted === 0) toast.info("Nothing to read", { description: "No open manual case has a document the model can read." });
            else if (outcome.failed === 0) toast.success(`${outcome.read} document${outcome.read === 1 ? "" : "s"} read`, { description: `${outcome.skipped} already had a reading.` });
            else toast.warning(`${outcome.read} read, ${outcome.failed} failed`, { description: outcome.firstError ?? undefined });
        } finally {
            setReading(false);
        }
    };

    return (
        <Button variant="outline" className="bg-card" disabled={reading || disabled} onClick={() => void readPending()} data-testid="kyc-read-pending">
            <Sparkles className="mr-1.5 size-4" />
            {reading ? "Reading documents…" : "Read pending documents"}
        </Button>
    );
}
