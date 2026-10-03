import { SubNav } from "@/components/adx/sub-nav";

/**
 * CR-1: the Creatives section's tabs (the owner, 25 September 2026).
 *
 * Review was the whole of it before, and three things the desk needed to
 * see were invisible. When an advertiser chooses ADX Design Agency the
 * creative sits at PENDING_UPLOAD, a status the review queue's chips left
 * out, so a design ADX owed appeared nowhere. A delivered design waiting on
 * the advertiser had no chase list. And nothing said whether approved
 * artwork had reached a print shop.
 *
 * All four tabs are the same `GET /campaigns/creatives/review-queue` under
 * a different status filter. The Review tab is the section's root so the
 * old `/moderation` address redirects somewhere that looks the same.
 */
export function CreativesNav() {
    return (
        <SubNav
            items={[
                { label: "Review", href: "/creatives", exact: true },
                { label: "Design requests", href: "/creatives/design-requests" },
                { label: "Awaiting advertiser", href: "/creatives/awaiting-advertiser" },
                { label: "Print-ready", href: "/creatives/print-ready" },
            ]}
        />
    );
}
