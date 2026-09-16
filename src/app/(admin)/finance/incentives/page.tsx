import type { Metadata } from "next";
import { IncentivesLoader } from "./incentives-loader";

export const metadata: Metadata = { title: "Incentives" };

export default function IncentivesPage() {
    return <IncentivesLoader />;
}
