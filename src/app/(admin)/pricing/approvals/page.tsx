import type { Metadata } from "next";
import { ApprovalsLoader } from "./approvals-loader";

export const metadata: Metadata = { title: "Price approvals" };

export default function PriceApprovalsPage() {
    return <ApprovalsLoader />;
}
