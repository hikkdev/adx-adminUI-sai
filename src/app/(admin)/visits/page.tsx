import type { Metadata } from "next";
import { VisitsLoader } from "./visits-loader";

export const metadata: Metadata = { title: "Visits" };

export default function VisitsPage() {
    return <VisitsLoader />;
}
