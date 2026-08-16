import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { api } from "@/services";
import { FlowsNav } from "../flows-nav";
import { TemplatesView } from "./templates-view";

export const metadata: Metadata = { title: "Fulfilment Templates" };

export default async function FulfilmentTemplatesPage() {
    const [templates, plans] = await Promise.all([api.flows.templates(), api.flows.plans()]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Fulfilment templates"
                subtitle="The steps field agents complete on an order, and the plans that chain them."
            />
            <FlowsNav />
            <TemplatesView templates={templates} plans={plans} />
        </div>
    );
}
