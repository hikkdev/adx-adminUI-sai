import type { Metadata } from "next";
import { QuotesLoader } from "./quotes-loader";

export const metadata: Metadata = { title: "Quotes" };

export default function QuotesPage() {
    return <QuotesLoader />;
}
