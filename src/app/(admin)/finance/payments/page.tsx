import type { Metadata } from "next";
import { PaymentsLoader } from "./payments-loader";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
    return <PaymentsLoader />;
}
