import type { Metadata } from "next";
import { PayoutsLoader } from "./payouts-loader";

export const metadata: Metadata = { title: "Payouts" };

export default function PayoutsPage() {
    return <PayoutsLoader />;
}
