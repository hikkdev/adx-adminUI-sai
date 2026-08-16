import type { Metadata } from "next";
import { api } from "@/services";
import { PricingNav } from "../pricing-nav";
import { SimulatorView } from "./simulator-view";

export const metadata: Metadata = { title: "Price Simulator" };

export default async function SimulatorPage() {
    const data = await api.pricing.simulator();
    return (
        <div className="space-y-5">
            <PricingNav />
            <SimulatorView defaults={data.defaults} steps={data.steps} />
        </div>
    );
}
