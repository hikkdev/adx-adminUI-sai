"use client";

import { PartyImportLoader } from "@/components/adx/party-import/party-import-loader";
import { PUBLISHER_IMPORT_CONFIG } from "@/components/adx/party-import/party-import-config";

/**
 * The publisher's import — Lot D (Q43/Q86) — on the party import kit
 * since package S: the same three steps every party has, over the
 * publisher's own routes (`POST /publishers/import`, `/publishers/imports`).
 */
export function ImportLoader({ importId }: { importId: string | null }) {
    return <PartyImportLoader config={PUBLISHER_IMPORT_CONFIG} importId={importId} />;
}
