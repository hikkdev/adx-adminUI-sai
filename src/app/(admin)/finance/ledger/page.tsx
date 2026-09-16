import type { Metadata } from "next";
import { LedgerLoader } from "./ledger-loader";

export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage() {
    return <LedgerLoader />;
}
