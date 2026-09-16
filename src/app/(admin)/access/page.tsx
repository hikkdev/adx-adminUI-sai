import type { Metadata } from "next";
import { AccessView } from "./access-view";

export const metadata: Metadata = { title: "Access grants" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the open grants have to be read from there.
 */
export default function AccessPage() {
    return <AccessView />;
}
