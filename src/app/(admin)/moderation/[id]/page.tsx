import type { Metadata } from "next";
import { CreativeLoader } from "./creative-loader";

export const metadata: Metadata = { title: "Creative Review" };

export default async function CreativeDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <CreativeLoader id={id} />;
}
