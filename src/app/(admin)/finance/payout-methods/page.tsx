import type { Metadata } from "next";
import { PayoutMethodsLoader } from "./payout-methods-loader";

export const metadata: Metadata = { title: "Payout methods" };

export default function PayoutMethodsPage() {
    return <PayoutMethodsLoader />;
}
