import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { LegalEntity } from "@/services/invoices";

/**
 * Shown while the legal entity has no GSTIN.
 *
 * A tax invoice names its supplier's GSTIN; without one the backend issues a
 * proforma from the `-PRO` series and consumes no tax number — the correct
 * behaviour, and one somebody in finance needs to be told about every time
 * they open the register, because the fix is on another screen.
 */
export function GstinBanner({ entity }: { entity: LegalEntity | null }) {
    if (!entity || entity.gstin) return null;
    return (
        <Card className="rounded-lg border-warning/40 bg-warning-soft p-3 shadow-none" role="status">
            <div className="flex items-start gap-2.5">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <p className="text-sm text-foreground">
                    Invoices are proforma until the legal entity carries a GSTIN.{" "}
                    <Link href="/finance/settings" className="font-medium underline underline-offset-2">
                        Set it under Legal entity &amp; tax
                    </Link>
                    .
                </p>
            </div>
        </Card>
    );
}
