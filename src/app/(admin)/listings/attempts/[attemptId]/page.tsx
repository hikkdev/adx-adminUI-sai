import type { Metadata } from "next";
import { AttemptLoader } from "./attempt-loader";

export const metadata: Metadata = { title: "Listing attempt" };

export default async function ListingAttemptPage({
    params,
}: {
    params: Promise<{ attemptId: string }>;
}) {
    const { attemptId } = await params;
    return <AttemptLoader attemptId={attemptId} />;
}
