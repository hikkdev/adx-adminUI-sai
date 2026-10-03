import type { Metadata } from "next";
import { PromoCodesLoader } from "./promo-codes-loader";

export const metadata: Metadata = { title: "Promo codes" };

/** PC-1: the codes advertisers type on Review & pay — made and switched here. */
export default function PromoCodesPage() {
    return <PromoCodesLoader />;
}
