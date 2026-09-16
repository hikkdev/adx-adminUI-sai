import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";

/** No fixtures: a seeded city here would be a market ADX had not opened. */
export function GeographiesOffline() {
    return (
        <Card className="rounded-lg border-border p-8 text-center shadow-none">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                A city's stage decides which functions ADX answers there. There is no seeded stand-in, because a fixture row would be a
                market ADX had not opened. Set <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and
                point the console at a running backend.
            </p>
        </Card>
    );
}
