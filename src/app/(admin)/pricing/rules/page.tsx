import type { Metadata } from "next";
import { RulesLoader } from "./rules-loader";

export const metadata: Metadata = { title: "Pricing rules" };

export default function RulesPage() {
    return <RulesLoader />;
}
