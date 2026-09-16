import type { Metadata } from "next";
import { FlowsLoader } from "./flows-loader";

export const metadata: Metadata = { title: "Flow Editor" };

/** DR 10 `5102:34069` — the flow cards. Server shell; the data is the loader's. */
export default function FlowsPage() {
    return <FlowsLoader />;
}
