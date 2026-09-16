import type { Metadata } from "next";
import { LibraryLoader } from "./library-loader";

export const metadata: Metadata = { title: "Training library" };

export default function LibraryPage() {
    return <LibraryLoader />;
}
