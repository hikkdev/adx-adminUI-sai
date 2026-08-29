import type { Metadata } from "next";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { api } from "@/services";
import { PricingNav } from "../../pricing-nav";

export const metadata: Metadata = { title: "Revenue Share" };

export default async function RevenueSharePage() {
    const data = await api.pricing.revenueShare();

    return (
        <div className="space-y-5">
            <PricingNav />
            <PageHeader
                title="Revenue share"
                subtitle="Commission tiers, category overrides and settlement rules"
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard
                    title="Commission tiers"
                    description="Platform take rate steps down as quarterly publisher GMV grows"
                    contentClassName="p-0"
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Tier</th>
                                <th className="px-5 py-2.5">Quarterly GMV</th>
                                <th className="px-5 py-2.5 text-right">Commission</th>
                                <th className="px-5 py-2.5 text-right">Effective</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.commissionTiers.map((tier) => (
                                <tr key={tier.tier} className="border-b last:border-0">
                                    <td className="px-5 py-3 font-medium text-foreground">{tier.tier}</td>
                                    <td className="px-5 py-3 text-muted-foreground">{tier.gmv}</td>
                                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                                        {tier.commission}
                                    </td>
                                    <td className="px-5 py-3 text-right text-muted-foreground tabular-nums">
                                        {tier.effective}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>

                <SectionCard
                    title="Category overrides"
                    description="Categories priced off the standard tier ladder"
                    contentClassName="p-0"
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-5 py-2.5">Category</th>
                                <th className="px-5 py-2.5">Reason</th>
                                <th className="px-5 py-2.5 text-right">Commission</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.categoryOverrides.map((override) => (
                                <tr key={override.category} className="border-b last:border-0">
                                    <td className="px-5 py-3 font-medium text-foreground">
                                        {override.category}
                                    </td>
                                    <td className="px-5 py-3 text-muted-foreground">{override.reason}</td>
                                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                                        {override.commission}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>

                <SectionCard
                    title="Agency deals"
                    description="How a booking splits when an agency sits in the middle"
                >
                    <FieldList items={data.agencyFlow} />
                </SectionCard>

                <SectionCard
                    title="Revenue split on a ₹10L booking"
                    description="Who receives what once every deduction lands"
                >
                    <FieldList items={data.revenueSplit} />
                </SectionCard>

                <SectionCard
                    title="SLA penalties"
                    description="Deducted from the publisher share before settlement"
                    contentClassName="p-0"
                    className="xl:col-span-2"
                >
                    <table className="w-full text-sm">
                        <tbody>
                            {data.slaPenalties.map((row) => (
                                <tr key={row.penalty} className="border-b last:border-0">
                                    <td className="px-5 py-3 text-foreground">{row.penalty}</td>
                                    <td className="px-5 py-3 text-right font-medium">{row.amount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SectionCard>
            </div>
        </div>
    );
}
