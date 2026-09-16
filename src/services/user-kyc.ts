import { api as http } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import type { KycLiveness } from "@/types";

/**
 * Presence at the desk — Lot N, on `/user-kyc`.
 *
 * Decision 131 gates a manual-path VERIFIED on the person's liveness video.
 * When the person is at the desk there is no phone in the loop, so the desk
 * has two ways to satisfy it, both by the party's own user id:
 *
 *   `POST /user-kyc/:userId/attest { note }` — the admin who met the person
 *   says so; the note (how they were met) is kept on the row and in the
 *   audit trail, and the liveness gate treats it as satisfied.
 *
 *   `POST /user-kyc/:userId { fileId }` — the short video the desk recorded,
 *   uploaded first under purpose USER_KYC on the party's behalf (or under
 *   the admin's own hand), handed in by its file id.
 */

export interface AttestedLiveness {
    kyc: KycLiveness & { userId: string };
    created: boolean;
}

/** The body `POST /user-kyc/:userId/attest` takes — the note is the evidence, 3–500 characters. */
export function attestationBody(note: string): { note: string } {
    const trimmed = note.trim();
    if (trimmed.length < 3) throw new Error("Say how the person was met — in person at which desk, or on a call when.");
    return { note: trimmed };
}

function live() {
    if (!isLive("kyc")) throw new Error("KYC is read from the API; connect the console to the ADX backend first.");
    return http;
}

export const userKycService = {
    /** The admin met the person; the row goes VERIFIED with who, when and the note. */
    attestPresence: (userId: string, note: string) => live().post<AttestedLiveness>(`/user-kyc/${userId}/attest`, attestationBody(note)),

    /** The liveness video the desk recorded, by the private USER_KYC file already uploaded. 403 for somebody else's file, 400 for another purpose. */
    recordLivenessAtDesk: (userId: string, fileId: string) => live().post<AttestedLiveness>(`/user-kyc/${userId}`, { fileId }),
};
