import type { Metadata } from "next";
import { TrainingLoader } from "./training-loader";

export const metadata: Metadata = { title: "Training" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the modules have to be read from there.
 */
export default function TrainingPage() {
    return <TrainingLoader />;
}
