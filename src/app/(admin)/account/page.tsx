import type { Metadata } from "next";
import { AccountLoader } from "./account-loader";

export const metadata: Metadata = { title: "My Account" };

export default function AccountPage() {
    return <AccountLoader />;
}
