import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { PublisherDetail } from "./publisher-detail";

export const metadata: Metadata = { title: "Publisher" };

export default async function PublisherDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const publisher = await api.publishers.get(id);
    if (!publisher) notFound();

    const [listings, kycCases, withdrawals, auditEvents] = await Promise.all([
        api.listings.list(),
        api.kyc.list(),
        api.finance.withdrawals(),
        api.audit.list(),
    ]);

    const sites = listings.filter((listing) => listing.publisherId === publisher.id);
    const kycCase = kycCases.find((candidate) => candidate.publisherId === publisher.id);
    const publisherWithdrawals = withdrawals.filter(
        (withdrawal) => withdrawal.requester === publisher.name
    );
    const activity = auditEvents.filter((event) => event.target.includes(publisher.name));

    return (
        <PublisherDetail
            publisher={publisher}
            sites={sites}
            kycCase={kycCase}
            withdrawals={publisherWithdrawals}
            activity={activity}
        />
    );
}
