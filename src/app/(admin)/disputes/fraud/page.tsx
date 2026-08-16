import type { Metadata } from "next";
import { FraudView } from "./fraud-view";

export const metadata: Metadata = { title: "Fraud Investigation" };

export default function FraudPage() {
    return <FraudView />;
}
