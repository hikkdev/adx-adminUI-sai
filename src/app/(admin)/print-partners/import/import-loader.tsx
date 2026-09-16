"use client";

import { PartyImportLoader } from "@/components/adx/party-import/party-import-loader";
import { PARTY_IMPORT_CONFIGS } from "@/components/adx/party-import/party-import-config";

/** Package S: the print partner import on the party import kit, over `/party-imports/print-partners`. */
export function ImportLoader({ importId }: { importId: string | null }) {
    return <PartyImportLoader config={PARTY_IMPORT_CONFIGS["print-partners"]} importId={importId} />;
}
