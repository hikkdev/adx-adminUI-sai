import type { Metadata } from "next";
import { ReconciliationLoader } from "./reconciliation-loader";

export const metadata: Metadata = { title: "Reconciliation" };

export default function ReconciliationPage() {
    return <ReconciliationLoader />;
}
