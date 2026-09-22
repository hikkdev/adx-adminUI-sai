import type { Metadata } from "next";
import { InviteLanding } from "./invite-landing";

export const metadata: Metadata = {
    title: "Your ADX invitation",
    description: "An invitation from ADX — earn from your space, or reach your customers on the street.",
    robots: { index: false, follow: false },
};

/** LH7 (D6): the landing behind adx.in/j/<code> — public, mobile-first, both themes; deep-links into the app when installed. */
export default async function InviteLandingPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = await params;
    return <InviteLanding code={code} />;
}
