"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { recordedLine, requestLine, requestOf } from "@/services/kyc";
import { KYC_STATE_META, shapeKycSummary } from "@/services/kyc-state";
import { PARTNER_DESK_FACTS, printPartnerKycService, PRINT_PARTNER_KYC_FIELDS, type PrintPartnerKycCase } from "@/services/print-partner-kyc";
import type { PrintPartner } from "@/services/print-partners";
import { KycRowActions } from "@/app/(admin)/kyc/_shared/kyc-row-actions";
import { RecordAtDeskDialog } from "@/app/(admin)/kyc/_shared/record-at-desk-dialog";

interface PartnerKycCardProps {
    partner: PrintPartner;
    /** The 409 `KYC_REQUIRED` activation answered, when it did — explained here, where the fix is. */
    activationRefusal: string | null;
    onChanged: () => void;
}

/**
 * The partner's KYC on its page — Lot N. The row's mirror (`kycStatus`)
 * and the record's four facts come with the partner read; the record
 * itself — who asked, who recorded, the liveness state — is the desk's
 * own read (`GET /print-partner-kyc/:partnerId`, by the partner's id), a
 * 404 meaning simply no record yet. N3-C: the partner read's own
 * `kyc.state` is the pill (the queue row's word), and the card offers the
 * actions that state allows — the one-click Digio request, the manual
 * ask, Record at the desk, Open the case. When
 * `kyc.printPartnerActivationRequiresKyc` is on, activation is refused
 * until the record is VERIFIED, and that refusal is explained on this card.
 */
export function PartnerKycCard({ partner, activationRefusal, onChanged }: PartnerKycCardProps) {
    const router = useRouter();
    const live = isLive("kyc");
    const resource = useApiResource<PrintPartnerKycCase | null>(`print-partner-kyc:for:${partner.id}:${live}`, () =>
        live ? printPartnerKycService.get(partner.id) : Promise.resolve(null)
    );
    const kycCase = resource.data ?? null;
    const summary = shapeKycSummary(partner.kyc, partner.kycStatus);
    const state = kycCase?.state ?? summary.state;
    const request = kycCase?.request ?? requestOf({ requestedAt: summary.requestedAt, requestedChannel: summary.requestedChannel, submittedAt: summary.submittedAt });
    const caseId = kycCase?.kycId ?? summary.kycId;
    const [recording, setRecording] = React.useState(false);
    const [recordingKey, setRecordingKey] = React.useState(0);
    const reload = () => {
        resource.reload();
        onChanged();
    };

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="partner-kyc-card">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">KYC</h3>
                <StatusBadge status={KYC_STATE_META[state]} />
            </div>

            {activationRefusal && (
                <div className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground" role="alert" data-testid="activation-kyc-refusal">
                    <p className="font-medium">Activation refused: KYC required.</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {activationRefusal} The setting &ldquo;A print partner must pass KYC before activation&rdquo; is on; record or request the KYC below, verify it on the desk, then activate.
                    </p>
                </div>
            )}

            <FieldList
                className="mt-4"
                items={[
                    ["Method", kycCase ? (kycCase.method === "DIGIO" ? "Digio" : "Documents") : partner.kyc ? (partner.kyc.method === "DIGIO" ? "Digio" : "Documents") : "—"],
                    [
                        "Submitted",
                        kycCase?.submittedAt ? formatDateTime(kycCase.submittedAt) : partner.kyc?.submittedAt ? formatDateTime(partner.kyc.submittedAt) : "Nothing yet",
                    ],
                    ["Recorded by", recordedLine(kycCase?.recorded ?? null) ?? "—"],
                    ["Documents on file", kycCase ? `${kycCase.documents.filter((item) => item.url).length} of ${PRINT_PARTNER_KYC_FIELDS.length}` : "—"],
                ]}
            />

            {request && (
                <p className="mt-4 text-sm text-muted-foreground" data-testid="request-line">
                    {requestLine(request)}
                    {request.open ? " — nothing has come back yet." : ""}
                </p>
            )}
            {resource.error && <p className="mt-4 text-xs text-danger">The KYC record could not be read: {resource.error}</p>}
            {!live && <p className="mt-4 text-xs text-muted-foreground">KYC is read from the API; turn the KYC domain on to see the record.</p>}

            {live && (
                <div className="mt-4 border-t pt-4" data-testid="kyc-desk-doors">
                    <KycRowActions
                        state={state}
                        party={partner.name}
                        hasAccount
                        contact={partner.mobile}
                        request={request}
                        caseHref={caseId ? `/kyc/print-partners/${caseId}` : null}
                        onDigio={async () => {
                            const result = await printPartnerKycService.requestDigio(caseId ?? partner.id);
                            return { digio: result.digio, notified: true };
                        }}
                        onRequest={async (channel, note) => {
                            const result = await printPartnerKycService.request(caseId ?? partner.id, channel, note);
                            return { digio: result.digio, notified: true };
                        }}
                        onRecord={() => {
                            setRecordingKey((value) => value + 1);
                            setRecording(true);
                        }}
                        onChanged={reload}
                    />
                    <RecordAtDeskDialog
                        key={recordingKey}
                        open={recording}
                        onOpenChange={setRecording}
                        party={partner.name}
                        userId={partner.userId}
                        purpose="PRINT_PARTNER_KYC"
                        tiles={PRINT_PARTNER_KYC_FIELDS}
                        facts={PARTNER_DESK_FACTS}
                        initial={
                            kycCase?.kycId
                                ? {
                                      documents: Object.fromEntries(kycCase.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined])),
                                      panNumber: kycCase.panNumber ?? partner.panNumber ?? "",
                                      govIdType: kycCase.govIdType ?? "",
                                  }
                                : { panNumber: partner.panNumber ?? "" }
                        }
                        liveness={kycCase?.liveness ?? null}
                        needsInfo={state === "NEEDS_INFO"}
                        onSubmit={async (body) => {
                            const recorded = await printPartnerKycService.recordAtDesk(caseId ?? partner.id, body);
                            return { caseHref: `/kyc/print-partners/${recorded.id}` };
                        }}
                        onRecorded={(href) => {
                            setRecording(false);
                            reload();
                            router.push(href);
                        }}
                    />
                </div>
            )}
        </Card>
    );
}
