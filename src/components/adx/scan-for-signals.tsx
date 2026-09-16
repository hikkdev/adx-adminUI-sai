"use client";

import Link from "next/link";
import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isLive } from "@/lib/api-config";
import { scanParam, type FraudSubjectType } from "@/services/fraud";

interface ScanForSignalsButtonProps {
    subjectType: FraudSubjectType;
    subjectId: string;
}

/**
 * "Scan for signals" on a party page — Lot G (Q138), package CG2.
 *
 * Opens the fraud desk with `?scan=TYPE:id`; the desk runs
 * `POST /fraud/scan/:type/:id` once on arrival and draws the result above
 * the queue, with the case it can open or the one already open against the
 * party. The scan is not run here so a party page that is re-rendered does
 * not audit `FRAUD_SUBJECT_SCANNED` against the party every time. Not drawn
 * while the fraud domain is off.
 */
export function ScanForSignalsButton({ subjectType, subjectId }: ScanForSignalsButtonProps) {
    if (!isLive("fraud")) return null;
    return (
        <Button variant="outline" className="bg-card" asChild>
            <Link href={`/disputes/fraud?scan=${encodeURIComponent(scanParam(subjectType, subjectId))}`}>
                <Radar className="mr-1.5 size-4" aria-hidden />
                Scan for signals
            </Link>
        </Button>
    );
}
