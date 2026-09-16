import { describe, expect, it } from "vitest";
import { uploadBody } from "./uploads";

/**
 * The multipart body the console sends to `POST /upload` — the file under
 * `file`, the purpose beside it, which is what the backend's middleware reads.
 */
describe("uploadBody", () => {
    it("carries the file under `file` and the purpose beside it", () => {
        const file = new File(["hello"], "pan-card.jpg", { type: "image/jpeg" });
        const body = uploadBody(file, "AGENT_KYC");
        expect(body.get("purpose")).toBe("AGENT_KYC");
        const sent = body.get("file");
        expect(sent).toBeInstanceOf(File);
        expect((sent as File).name).toBe("pan-card.jpg");
        expect(body.get("ownerUserId")).toBeNull();
    });

    it("names the party the file is for when the desk uploads on their behalf (Lot N)", () => {
        const file = new File(["hello"], "pan-card.jpg", { type: "image/jpeg" });
        expect(uploadBody(file, "PRINT_PARTNER_KYC", { ownerUserId: "usr_partner" }).get("ownerUserId")).toBe("usr_partner");
        expect(uploadBody(file, "KYC", { ownerUserId: null }).get("ownerUserId")).toBeNull();
    });
});
