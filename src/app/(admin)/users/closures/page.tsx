import type { Metadata } from "next";
import { ClosuresLoader } from "./closures-loader";

export const metadata: Metadata = { title: "Closure cases" };

export default function ClosureCasesPage() {
    return <ClosuresLoader />;
}
