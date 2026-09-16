import type { Metadata } from "next";
import { VocabularyLoader } from "./vocabulary-loader";

export const metadata: Metadata = { title: "Vocabulary queue" };

export default function VocabularyPage() {
    return <VocabularyLoader />;
}
