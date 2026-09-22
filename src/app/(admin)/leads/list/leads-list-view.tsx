"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LEAD_STATUSES, LEAD_TEMPERATURES, type LeadStatus, type LeadTemperature } from "@/services/leads";
import { LeadsLoader } from "../leads-loader";

/**
 * LH9: the list with its opening facets read off the URL — the overview's
 * temperature tiles and category rows land here with one in force. An
 * unknown value is ignored rather than sent. The category has no control of
 * its own on the desk, so a line above the table names it with a way out.
 */
export function LeadsListView() {
    const params = useSearchParams();
    const status = params.get("status");
    const temperature = params.get("temperature");
    const category = params.get("category")?.trim() || null;
    return (
        <>
            {category ? (
                <p className="text-sm text-muted-foreground" data-testid="leads-list-category">
                    Showing the <span className="font-medium text-foreground">{category}</span> category only.{" "}
                    <Link href="/leads/list" className="text-primary hover:underline">
                        Show every category
                    </Link>
                </p>
            ) : null}
            <LeadsLoader
                initialStatus={status && (LEAD_STATUSES as readonly string[]).includes(status) ? (status as LeadStatus) : undefined}
                initialTemperature={temperature && (LEAD_TEMPERATURES as readonly string[]).includes(temperature) ? (temperature as LeadTemperature) : undefined}
                category={category}
            />
        </>
    );
}
