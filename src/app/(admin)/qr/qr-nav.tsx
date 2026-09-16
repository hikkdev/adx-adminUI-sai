import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";

/**
 * The QR desk's two screens (K-B1): the codes, and one person's scans. The
 * sidebar draws the "QR codes" row only; the Scans screen is reached from
 * this strip and from the QR scans card on a person's page.
 */
export const QR_NAV_ITEMS: { label: string; href: string; exact?: boolean }[] = [
    { label: "Codes", href: "/qr", exact: true },
    { label: "Scans", href: "/qr/scans" },
];

export function QrNav() {
    return <SubNav items={QR_NAV_ITEMS} />;
}

/** What the desk shows with the API off: nothing seeded, and a sentence saying why. */
export function QrOffline({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="space-y-5">
            <QrNav />
            <PageHeader title={title} subtitle={subtitle} />
            <EmptyState
                icon={PlugZap}
                title="QR codes read the API"
                description="This console is running on fixtures. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the real codes and their scans."
            />
        </div>
    );
}
