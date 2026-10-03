"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { promoCodesReadApi, promoCodesService, type PromoCode } from "@/services/promo-codes";
import { GrowthOffline } from "../growth-offline";
import { PromoCodesView } from "./promo-codes-view";

export const PROMO_TITLE = "Promo codes";
export const PROMO_SUBTITLE = "Codes an advertiser types on Review & pay: a percent or a flat amount off media and production, with a cap, a window and limits.";

/**
 * The desk's data: every code, on or off, newest first. One resource —
 * `GET /promo-codes` answers the whole list with its redemption counts.
 */
export function PromoCodesLoader() {
    const live = promoCodesReadApi();
    const resource = useApiResource<PromoCode[]>(`growth:promo-codes:${live}`, () => (live ? promoCodesService.list() : Promise.resolve([])));

    if (!live) return <GrowthOffline title={PROMO_TITLE} subtitle={PROMO_SUBTITLE} />;

    return <ResourceBoundary resource={resource}>{(codes) => <PromoCodesView codes={codes} onChanged={resource.reload} />}</ResourceBoundary>;
}
