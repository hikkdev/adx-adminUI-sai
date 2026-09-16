import type { Metadata } from "next";
import { RefundsLoader } from "./refunds-loader";

export const metadata: Metadata = { title: "Refund desk" };

export default function RefundsPage() {
    return <RefundsLoader />;
}
