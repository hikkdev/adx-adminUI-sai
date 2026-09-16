import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * What the wallet screens show when there is no backend to read.
 *
 * The same call the pricing engine and the commission screens make, for the
 * same reason: a seeded balance is indistinguishable from a real one, and a
 * console that shows invented money in a section people approve payouts from is
 * worse than a console that shows nothing. Nothing under Finance's wallet,
 * ledger, verification, incentive or settings tabs has a fixture fallback.
 */
export function FinanceOffline({ what }: { what: string }) {
    return (
        <Card className="rounded-lg border-border p-8 text-center shadow-none">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
                Not connected to the ADX backend
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {what} is real money in real wallets. There is no seeded stand-in here, because a
                fixture figure would look exactly like a live one. Set{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code>{" "}
                and point the console at the API to work these screens.
            </p>
        </Card>
    );
}
