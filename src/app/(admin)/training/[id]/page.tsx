import type { Metadata } from "next";
import { ModuleLoader } from "./module-loader";

export const metadata: Metadata = { title: "Training module" };

export default async function ModulePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ModuleLoader id={id} />;
}
