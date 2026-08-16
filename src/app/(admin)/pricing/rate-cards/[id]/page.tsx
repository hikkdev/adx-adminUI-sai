import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { RateCardBuilder } from "./rate-card-builder";

export const metadata: Metadata = { title: "Rate Card Builder" };

export default async function RateCardBuilderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const [rateCards, builder] = await Promise.all([
        api.pricing.rateCards(),
        api.pricing.rateCardBuilder(),
    ]);
    const rateCard = rateCards.find((candidate) => candidate.id === id);
    if (!rateCard) notFound();

    return (
        <RateCardBuilder
            rateCard={rateCard}
            matrix={builder.matrix}
            settings={builder.settings}
        />
    );
}
