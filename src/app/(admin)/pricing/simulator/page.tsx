import type { Metadata } from "next";
import { SimulatorLoader } from "./simulator-loader";

export const metadata: Metadata = { title: "Pricing simulator" };

export default function SimulatorPage() {
    return <SimulatorLoader />;
}
