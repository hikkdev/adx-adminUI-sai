import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { FlowsNav } from "../flows-nav";
import { TemplatesLoader } from "./templates-loader";

export const metadata: Metadata = { title: "Fulfilment Templates" };

export default function FulfilmentTemplatesPage() {
    return (
        <div className="space-y-5">
            <PageHeader
                title="Fulfilment templates"
                subtitle="The steps field agents complete on an order, and the plans that chain them."
            />
            <FlowsNav />
            <TemplatesLoader />
        </div>
    );
}
