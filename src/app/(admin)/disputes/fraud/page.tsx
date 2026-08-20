import type { Metadata } from "next";
import { api } from "@/services";
import { FraudView } from "./fraud-view";

export const metadata: Metadata = { title: "Fraud Investigation" };

export default async function FraudPage() {
    const cases = await api.disputes.fraudCases();
    return <FraudView cases={cases} />;
}
