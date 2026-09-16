"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeatureCoverageChart } from "@/components/charts/lazy";
import { FLAG_SURFACE_LABEL, manifestChecksOf, type Coverage } from "@/services/flags";

/**
 * The Coverage card at the top of Settings › Feature flags (CG5): how many
 * features the registry names per surface, how many rows are manual
 * against registered, and whether each surface's manifest is where the
 * registry says it is — so a surface whose manifest is stale says so here
 * rather than in a backend script's exit code. G11-2: the verdict is the
 * registry read's own `check` block, the same checker as the script; a
 * backend that does not serve it leaves the list empty and says so.
 */
export function CoverageCard({ coverage }: { coverage: Coverage }) {
    const checks = manifestChecksOf(coverage.check);
    const stale = checks.filter((check) => !check.ok);
    return (
        <Card className="rounded-lg border-border shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Coverage</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {coverage.generatedBy
                            ? `Every feature the registry document names, by surface, against the ${coverage.total} rows the console can switch.`
                            : "The registry document could not be read; only the rows are listed."}
                    </p>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {[
                        ["Rows", coverage.total],
                        ["Registered", coverage.registered],
                        ["Manual", coverage.manual],
                        ["Dark launches", coverage.dark],
                    ].map(([label, value]) => (
                        <div key={label} className="text-right">
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="text-metric text-foreground">{value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
            <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div>
                    <p className="text-xs font-medium text-muted-foreground">Features per surface</p>
                    <div className="mt-2">
                        <FeatureCoverageChart data={coverage.surfaces} />
                    </div>
                </div>
                <div>
                    <p className="text-xs font-medium text-muted-foreground">
                        Manifest check
                        {coverage.check && (
                            <span className={coverage.check.current ? "ml-2 font-normal text-success" : "ml-2 font-normal text-warning"}>
                                {coverage.check.current ? "document current" : "document behind the code"}
                            </span>
                        )}
                    </p>
                    {!coverage.check && (
                        <p className="mt-2 text-sm text-muted-foreground">This backend does not serve the registry check; run npm run features:check on it instead.</p>
                    )}
                    <ul className="mt-2 space-y-2" aria-label="Manifest check by surface">
                        {checks.map((check) => {
                            const surface = coverage.surfaces.find((row) => row.surface === check.surface);
                            return (
                                <li key={check.surface} className="flex items-start gap-2.5 text-sm">
                                    {check.ok ? (
                                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                                    ) : (
                                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                                    )}
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground">
                                            {FLAG_SURFACE_LABEL[check.surface]}
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                {surface ? `${surface.withRow} of ${surface.features} with a row` : null}
                                                {surface?.manual ? ` · ${surface.manual} manual` : null}
                                            </span>
                                        </p>
                                        {check.ok ? (
                                            <p className="text-xs text-muted-foreground">
                                                {check.problems[0] ??
                                                    (check.surface === "BACKEND" ? "The document matches every declaration." : "The document matches this surface's manifest.")}
                                            </p>
                                        ) : (
                                            check.problems.map((problem) => (
                                                <p key={problem} className="text-xs text-warning">
                                                    {problem}
                                                </p>
                                            ))
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    {stale.length > 0 && (
                        <p className="mt-3 text-xs text-muted-foreground">
                            A manifest that is behind lists a screen under a stale key, or not at all — the kill switch on it would
                            switch the wrong thing. Sync and commit the document on the backend, then restart it so the upsert runs.
                        </p>
                    )}
                </div>
            </div>
        </Card>
    );
}
