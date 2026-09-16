import type { Metadata } from "next";
import { PricingModelLoader } from "./model-loader";

export const metadata: Metadata = { title: "Pricing model" };

export default function PricingModelPage() {
    return <PricingModelLoader />;
}
