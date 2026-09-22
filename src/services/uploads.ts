import { api as http } from "@/lib/api-client";

/**
 * The console's one upload path (D3).
 *
 * `POST /upload` takes a multipart body — the file under `file`, the purpose
 * beside it — and answers with where the file now lives. The API client
 * already passes a FormData body through untouched; this is the function
 * every console screen that stores a document calls, so the field names and
 * the purpose vocabulary live in one place.
 */

export type UploadPurpose =
    | "KYC"
    | "AGENT_KYC"
    /** Lot D: the employee desk's twin of AGENT_KYC, private like it. */
    | "EMPLOYEE_KYC"
    /** Lot N: the advertiser's documents, the liveness video and the print partner's documents — private; the desk uploads them on the party's behalf. */
    | "ADVERTISER_KYC"
    | "USER_KYC"
    | "PRINT_PARTNER_KYC"
    | "LISTING_PHOTO"
    | "VERIFICATION"
    | "AVATAR"
    /** QR-9: a brand file — the wordmark, the mark, the icon — uploaded from Settings › Branding. Public. */
    | "BRANDING"
    | "CAMPAIGN_CREATIVE"
    /** Lot B (Q118): the bank slip or cheque image behind a structured top-up. */
    | "TOPUP_PROOF"
    /** Lot H (Q147) / G13-B: a print partner's rate card and monthly invoice — private; the desk uploads them on the partner's behalf. */
    | "PARTNER_RATE_CARD"
    | "PARTNER_INVOICE"
    /**
     * Lot I: a file on a support message — an image or a PDF, private, and
     * readable by the desk, the uploader and the requester of the thread it
     * lands on. The size cap is the platform setting `support.liveChat
     * .attachmentMaxMb`, enforced by the server before the message is written.
     */
    | "SUPPORT_ATTACHMENT"
    /** LH4: a wall or a shop front an agent photographed in the street — private, kept for the listing draft. */
    | "LEAD_CAPTURE"
    | "OTHER";

export interface Uploaded {
    url: string;
    id: string;
}

/**
 * Lot N: an upload on somebody's behalf. `ownerUserId` names the party the
 * file belongs to — an admin may name anyone; the server then lets that
 * party open it and lets the desk hand it in as theirs (a publisher's KYC
 * tile, the advertiser's, the print partner's, the liveness video). Left
 * out, the file is the uploader's own.
 */
export interface UploadOptions {
    ownerUserId?: string | null;
}

/** The multipart body `POST /upload` expects. Exported for the test that pins it. */
export function uploadBody(file: File, purpose: UploadPurpose, options: UploadOptions = {}): FormData {
    const body = new FormData();
    body.append("file", file, file.name);
    body.append("purpose", purpose);
    if (options.ownerUserId) body.append("ownerUserId", options.ownerUserId);
    return body;
}

export const uploadService = {
    upload: (file: File, purpose: UploadPurpose, options: UploadOptions = {}): Promise<Uploaded> =>
        http.post<Uploaded>("/upload", uploadBody(file, purpose, options)),
};
