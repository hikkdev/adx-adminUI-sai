import type { Metadata } from "next";
import { ModerationLoader } from "./moderation-loader";

export const metadata: Metadata = { title: "Content Review" };

export default function ModerationPage() {
    return <ModerationLoader />;
}
