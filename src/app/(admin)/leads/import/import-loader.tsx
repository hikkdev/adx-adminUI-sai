"use client";

import { PartyImportLoader } from "@/components/adx/party-import/party-import-loader";
import { PARTY_IMPORT_CONFIGS } from "@/components/adx/party-import/party-import-config";

/** LH3: the lead import on the party import kit, over `/party-imports/leads`. */
export function ImportLoader({ importId }: { importId: string | null }) {
    return <PartyImportLoader config={PARTY_IMPORT_CONFIGS["leads"]} importId={importId} />;
}
