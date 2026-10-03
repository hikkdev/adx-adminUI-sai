import type { Metadata } from "next";
import { ContentNav } from "../../content-nav";
import { BuilderLoader } from "./builder-loader";

export const metadata: Metadata = { title: "Content · Layout builder" };

/** LM-1: one surface's layout — the draft's blocks in order, the preview beside them, publish and history. */
export default async function LayoutBuilderPage({ params }: { params: Promise<{ surface: string }> }) {
    const { surface } = await params;
    return (
        <div className="space-y-5">
            <ContentNav />
            <BuilderLoader surface={surface} />
        </div>
    );
}
