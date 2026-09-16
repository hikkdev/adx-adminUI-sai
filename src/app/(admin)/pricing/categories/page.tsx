import type { Metadata } from "next";
import { CategoriesLoader } from "./categories-loader";

export const metadata: Metadata = { title: "Category rules" };

export default function CategoriesPage() {
    return <CategoriesLoader />;
}
