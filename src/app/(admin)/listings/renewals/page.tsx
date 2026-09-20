import type { Metadata } from "next";
import { ListingsNav } from "../listings-nav";
import { RenewalsLoader } from "./renewals-loader";

export const metadata: Metadata = { title: "Renewals due" };

/**
 * QR-24 (the owner, 17 Sep 2026): the spots held on a lease, a licence or a
 * permit whose term is ending or has ended — the desk that watches a
 * publisher's right to sell a space, beside the queue that watches whether
 * the space still stands.
 */
export default function RenewalsPage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <RenewalsLoader />
        </div>
    );
}
