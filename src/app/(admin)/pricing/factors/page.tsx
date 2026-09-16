import type { Metadata } from "next";
import { FactorsLoader } from "./factors-loader";

export const metadata: Metadata = { title: "Pricing factors" };

export default function FactorsPage() {
    return <FactorsLoader />;
}
