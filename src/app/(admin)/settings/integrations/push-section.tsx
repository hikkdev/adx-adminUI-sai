"use client";

import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { PUSH_REASON_LABEL, type PushStatus } from "@/services/integrations";

/**
 * Push — G6 (Q103/133): FCM HTTP v1 through `FIREBASE_SERVICE_ACCOUNT_JSON`
 * in the backend's environment. Package CG4 (Q131) asked for a card that
 * says whether it is configured, never the secret.
 *
 * G11-2: `GET /integrations` carries `push: { configured, reason? }` — the
 * verdict `shared/push` reaches over the environment, computed in the
 * mapper; the service account is never on the wire and `push` is not a
 * section the PUT accepts, so the card has nothing to write. A backend
 * older than the field leaves `push` absent and the card says so.
 */
export function PushSection({ push }: { push: PushStatus | undefined }) {
    const badge = !push
        ? { label: "Not reported", tone: "neutral" as const }
        : push.configured
          ? { label: "Configured", tone: "success" as const }
          : { label: push.reason === "FCM_MISCONFIGURED" ? "Misconfigured" : "Not configured", tone: "danger" as const };
    return (
        <SectionCard title="Push" description="Firebase Cloud Messaging — the phones' third channel beside email and SMS.">
            <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="push-status">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">Firebase Cloud Messaging</p>
                    <StatusBadge status={badge} />
                </div>
                <p className="text-xs text-muted-foreground">
                    {!push
                        ? "This backend does not report whether the service account is set; a phone's push that could not leave shows in the delivery log as FCM_NOT_CONFIGURED."
                        : push.configured
                          ? "The service account in the backend's environment is usable; pushes leave through FCM HTTP v1."
                          : (push.reason && PUSH_REASON_LABEL[push.reason]) || "The service account is not usable; every push is skipped."}
                </p>
                {push && !push.configured && push.reason && (
                    <p className="text-xs text-muted-foreground">
                        Delivery rows it skips carry{" "}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{push.reason}</code>. The account is set in the environment, not
                        here.
                    </p>
                )}
            </div>
        </SectionCard>
    );
}
