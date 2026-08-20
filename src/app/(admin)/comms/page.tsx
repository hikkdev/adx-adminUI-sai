import type { Metadata } from "next";
import { api } from "@/services";
import { CommsNav } from "./comms-nav";
import { TemplatesView } from "./templates/templates-view";

export const metadata: Metadata = { title: "Comms" };

export default async function CommsPage() {
    const { templates, variables } = await api.comms.templates();

    return (
        <div className="space-y-5">
            <CommsNav />
            <TemplatesView templates={templates} variables={variables} />
        </div>
    );
}
