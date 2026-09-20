import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedTickProps {
    /** The party's `kycStatus`; the tick is drawn for VERIFIED and nothing else. */
    kycStatus: string | null | undefined;
    className?: string;
    /** 14 on a roster row, 18 beside a page title. */
    size?: number;
}

/**
 * QR-3 (17 Sep 2026): the verified mark every external party — publisher,
 * advertiser, print partner — earns the same way: their identity check
 * decided VERIFIED. Drawn beside the name wherever the name is drawn, on
 * the roster and on the page, so the console reads it the way the phones
 * do. Nothing is drawn for any other state; the KYC column and the KYC
 * card say what that state is.
 */
export function VerifiedTick({ kycStatus, className, size = 14 }: VerifiedTickProps) {
    if (kycStatus !== "VERIFIED") return null;
    return (
        <span
            role="img"
            aria-label="KYC verified"
            title="KYC verified"
            data-testid="verified-tick"
            className={cn("inline-flex shrink-0 items-center text-success", className)}
        >
            <BadgeCheck style={{ width: size, height: size }} aria-hidden />
        </span>
    );
}
