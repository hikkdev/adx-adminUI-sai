import type { Metadata } from "next";
import { IntakeLoader } from "./intake-loader";

export const metadata: Metadata = { title: "Onboarding intake" };

/** Lot D (Q131) — the back-office intake: agents and employees submitted, reviewed, approved into being. */
export default async function IntakePage({ searchParams }: { searchParams: Promise<{ userType?: string; status?: string }> }) {
    const params = await searchParams;
    return <IntakeLoader initialUserType={params.userType} initialStatus={params.status} />;
}
