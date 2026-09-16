import type { Metadata } from "next";
import { UserLoader } from "./user-loader";

export const metadata: Metadata = { title: "User" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <UserLoader id={id} />;
}
