import type { Metadata } from "next";
import { AttemptsLoader } from "./attempts-loader";

export const metadata: Metadata = { title: "Listing attempts" };

export default function ListingAttemptsPage() {
    return <AttemptsLoader />;
}
