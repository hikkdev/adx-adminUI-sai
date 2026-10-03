import type { Metadata } from "next";
import { CreativesNav } from "./creatives-nav";
import { ModerationLoader } from "./moderation-loader";

export const metadata: Metadata = { title: "Creative review" };

/**
 * CR-1: the Review tab — the desk as it was, at the section's root. It was
 * `/moderation`; `next.config.ts` redirects the old address.
 */
export default function CreativeReviewPage() {
    return (
        <div className="space-y-5">
            <CreativesNav />
            <ModerationLoader />
        </div>
    );
}
