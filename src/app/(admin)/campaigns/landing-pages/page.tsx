import type { Metadata } from "next";
import { LandingPagesLoader } from "./landing-pages-loader";

export const metadata: Metadata = { title: "Landing pages" };

/** Lot E (Q106): the review list of the ADX pages campaign codes send people to. */
export default function LandingPagesPage() {
    return <LandingPagesLoader />;
}
