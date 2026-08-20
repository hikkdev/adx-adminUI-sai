import type { Metadata } from "next";
import { api } from "@/services";
import { PricingNav } from "../pricing-nav";
import { PricingModelView } from "./pricing-model-view";

export const metadata: Metadata = { title: "Pricing Model" };

export default async function PricingModelPage() {
    const [dimensions, rateCards, categories, seasonality, rule] = await Promise.all([
        api.pricing.dimensions(),
        api.pricing.rateCards(),
        api.pricing.categories(),
        api.pricing.seasonality(),
        api.pricing.rule(),
    ]);

    return (
        <div className="space-y-5">
            <PricingNav />
            <PricingModelView
                sizeBands={dimensions.sizeBands}
                illumination={dimensions.illuminationMultipliers}
                aspects={dimensions.aspectFactors}
                rateCards={rateCards}
                categories={categories}
                seasonality={seasonality}
                rule={rule}
            />
        </div>
    );
}
