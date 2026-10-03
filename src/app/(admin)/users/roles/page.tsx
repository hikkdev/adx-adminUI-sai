import type { Metadata } from "next";
import { RolesLoader } from "./roles-loader";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default function RolesPage() {
    return <RolesLoader />;
}
