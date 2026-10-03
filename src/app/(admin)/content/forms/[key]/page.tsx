import type { Metadata } from "next";
import { ContentNav } from "../../content-nav";
import { FormLoader } from "./form-loader";

export const metadata: Metadata = { title: "Content · Form" };

/** FM-1: one form — its settings, the screens and fields of its draft, a phone preview beside them, its answers. */
export default async function FormPage({ params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;
    return (
        <div className="space-y-5">
            <ContentNav />
            <FormLoader formKey={decodeURIComponent(key)} />
        </div>
    );
}
