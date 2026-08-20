import type { Metadata } from "next";
import { api } from "@/services";
import { CommsNav } from "../comms-nav";
import { TemplatesView } from "./templates-view";

export const metadata: Metadata = { title: "Notification Templates" };

export default async function TemplatesPage() {
    const { templates, variables } = await api.comms.templates();

    return (
        <div className="space-y-5">
            <CommsNav />
            <TemplatesView templates={templates} variables={variables} />
        </div>
    );
}
