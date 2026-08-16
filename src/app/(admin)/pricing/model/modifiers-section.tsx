import { Card } from "@/components/ui/card";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import type { FactorRow, SizeBand } from "@/types";

interface ModifiersSectionProps {
    sizeBands: SizeBand[];
    sqftSlabs: FactorRow[];
    illuminationMultipliers: FactorRow[];
    aspectFactors: { label: string; rows: FactorRow[] }[];
    workedExample: { descriptor: string; steps: [string, string][]; total: string };
}

function FactorTable({ rows }: { rows: FactorRow[] }) {
    return (
        <table className="w-full text-sm">
            <tbody>
                {rows.map((row) => (
                    <tr key={row.factor} className="border-b last:border-0">
                        <td className="py-2.5 text-foreground">{row.factor}</td>
                        <td className="py-2.5 text-right font-medium tabular-nums">{row.multiplier}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** Stage 2 of the pricing model: how physical attributes scale the base rate. */
export function ModifiersSection({
    sizeBands,
    sqftSlabs,
    illuminationMultipliers,
    aspectFactors,
    workedExample,
}: ModifiersSectionProps) {
    return (
        <div className="space-y-4">
            <SectionCard
                title="Size bands"
                description="Banded multipliers applied on top of the media-type base rate"
                contentClassName="p-0"
            >
                <SimpleTable<SizeBand>
                    className="rounded-none border-0"
                    rows={sizeBands}
                    rowKey={(band) => band.band}
                    columns={[
                        {
                            key: "band",
                            label: "Band",
                            render: (band) => (
                                <span className="font-medium text-foreground">{band.band}</span>
                            ),
                        },
                        {
                            key: "dimensions",
                            label: "Dimensions range",
                            render: (band) => (
                                <span className="text-muted-foreground">{band.dimensions}</span>
                            ),
                        },
                        {
                            key: "area",
                            label: "Area range",
                            render: (band) => (
                                <span className="text-muted-foreground">{band.areaRange}</span>
                            ),
                        },
                        { key: "basis", label: "Rate basis", render: (band) => band.rateBasis },
                        {
                            key: "multiplier",
                            label: "Multiplier",
                            render: (band) => (
                                <span className="font-medium tabular-nums">{band.multiplier}</span>
                            ),
                        },
                    ]}
                />
            </SectionCard>

            <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard
                    title="Per sq ft slabs"
                    description="Used when a band prices per square foot"
                >
                    <FactorTable rows={sqftSlabs} />
                </SectionCard>
                <SectionCard title="Illumination" description="Multiplier by lighting type">
                    <FactorTable rows={illuminationMultipliers} />
                </SectionCard>
            </div>

            <SectionCard
                title="Aspect and visibility"
                description="Placement factors that compound with size and illumination"
            >
                <div className="grid gap-6 md:grid-cols-3">
                    {aspectFactors.map((block) => (
                        <div key={block.label}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {block.label}
                            </p>
                            <div className="mt-2">
                                <FactorTable rows={block.rows} />
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <Card className="rounded-lg border-border p-5 shadow-none">
                <h3 className="text-base font-semibold text-foreground">Worked example</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{workedExample.descriptor}</p>
                <div className="mt-4 max-w-xl">
                    <FieldList items={workedExample.steps} />
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                        <span className="text-sm font-semibold text-foreground">Weekly rate</span>
                        <span className="text-base font-semibold text-primary">
                            {workedExample.total}
                        </span>
                    </div>
                </div>
            </Card>
        </div>
    );
}
