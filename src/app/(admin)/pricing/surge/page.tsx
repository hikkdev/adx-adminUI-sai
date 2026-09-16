import type { Metadata } from "next";
import { SurgeLoader } from "./surge-loader";

export const metadata: Metadata = { title: "Surge calendar" };

export default function SurgePage() {
    return <SurgeLoader />;
}
