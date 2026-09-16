import type { Metadata } from "next";
import { CommsNav } from "./comms-nav";
import { TemplatesLoader } from "./templates/templates-loader";

export const metadata: Metadata = { title: "Comms" };

export default function CommsPage() {
    return (
        <div className="space-y-5">
            <CommsNav />
            <TemplatesLoader />
        </div>
    );
}
