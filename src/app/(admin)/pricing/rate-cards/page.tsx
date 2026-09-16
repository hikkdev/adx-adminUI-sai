import type { Metadata } from "next";
import { RateCardsLoader } from "./rate-cards-loader";

export const metadata: Metadata = { title: "Rate cards" };

export default function RateCardsPage() {
    return <RateCardsLoader />;
}
