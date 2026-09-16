import type { Metadata } from "next";
import { StaleLoader } from "./stale-loader";

export const metadata: Metadata = { title: "Stale terms" };

export default function StaleTermsPage() {
    return <StaleLoader />;
}
