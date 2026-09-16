import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * What the print-partner screens show with no backend to read.
 *
 * No fixtures, and none were removed to get here: no seed file has ever
 * described a print shop or a print job. A partner is a payee whose approved
 * costs are real money, and a seeded one would be a shop nobody owes.
 */
export function PrintPartnersOffline() {
    return (
        <Card className="rounded-lg border-border p-8 text-center shadow-none">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                A print partner is a payee: approved print costs land in its wallet and leave by NEFT.
                There is no seeded stand-in, because a fixture shop would be one ADX appears to owe.
                Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code>{" "}
                and point the console at a running backend.
            </p>
        </Card>
    );
}
