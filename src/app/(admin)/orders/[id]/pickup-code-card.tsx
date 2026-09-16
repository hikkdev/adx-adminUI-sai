"use client";

import { ExternalLink, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApiResource } from "@/lib/use-api-resource";
import { orderService } from "@/services/orders";
import { qrService, type QrView } from "@/services/qr";
import type { Order } from "@/types";

/** The statuses between "prints are ready" and "collected", where a code exists to print. */
const HOLDS_CODE: Order["status"][] = ["PENDING_AGENT", "AGENT_REJECTED", "SLOT_PROPOSED", "SLOT_CONFIRMED"];

/**
 * The package's pickup code (A9), for the print shop.
 *
 * Marking prints ready mints an order QR with purpose PICKUP; the agent
 * scans it at collection and `collect-prints` refuses any other code. The
 * shop needs the code on the package, so this is where ops prints it. Once
 * the agent has collected, the code is spent and the card says so.
 */
export function PickupCodeCard({ order }: { order: Order }) {
    const wanted = HOLDS_CODE.includes(order.status);
    const resource = useApiResource<QrView | null>(`pickup:${order.id}:${order.status}`, async () => {
        if (!wanted) return null;
        const code = await orderService.pickupCode(order.id);
        return code ? qrService.get(code.qrId) : null;
    });

    if (!wanted) return null;

    const qr = resource.data;
    return (
        <Card className="flex flex-wrap items-center gap-4 rounded-lg border-border p-4 shadow-none">
            {qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- the image is the API's own render of the code
                <img src={qr.dataUrl} alt={`Pickup code for ${order.id}`} className="size-24 rounded-md border bg-white" />
            ) : (
                <div className="flex size-24 items-center justify-center rounded-md border bg-muted/40">
                    <QrCode className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
                </div>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Pickup code</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                    {resource.loading && !qr
                        ? "Fetching the package's code…"
                        : qr
                          ? "Print this on the package. The agent scans it at collection, and no other code will do."
                          : resource.error
                            ? resource.error
                            : "No pickup code on this order yet — it is minted when the prints are marked ready."}
                </p>
                {qr && <p className="mt-1 font-mono text-xs text-muted-foreground">{qr.qrId}</p>}
            </div>
            {qr && (
                <Button variant="outline" className="bg-card" asChild>
                    <a href={qr.pngUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1.5 size-4" />
                        Open to print
                    </a>
                </Button>
            )}
        </Card>
    );
}
