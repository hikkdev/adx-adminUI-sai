import type { Metadata } from "next";
import { PublishersNav } from "../publishers-nav";
import { ActivationLoader } from "./activation-loader";

export const metadata: Metadata = { title: "Publisher activation" };

/**
 * The supply funnel by onboarding stage (the DR 10 frame). N3-C (the
 * owner, 14 Sep 2026): folded into the Publishers section as its
 * "Activation funnel" tab — it was the rail's own "Activation" row, and a
 * funnel dashboard over the publishers does not need a rail row of its
 * own. The content is unchanged; the tab strip is new.
 *
 * Data is fetched in the client: the API client authenticates from
 * localStorage, so a server component has no session to read with.
 */
export default function PublisherActivationPage() {
    return (
        <div className="space-y-5">
            <PublishersNav />
            <ActivationLoader />
        </div>
    );
}
