import type { Metadata } from "next";
import { CityLoader } from "./city-loader";

export const metadata: Metadata = { title: "City" };

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return <CityLoader slug={slug} />;
}
