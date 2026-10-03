"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/adx/status-badge";
import { isLive } from "@/lib/api-config";
import { formatDateTime } from "@/lib/format";
import { useApiResource, type ApiResource } from "@/lib/use-api-resource";
import {
    ATTEMPT_STATUS_META,
    SESSION_STATUS_META,
    STEP_STATUS_META,
    answeredByProvider,
    checkLabel,
    formatLatency,
    resultValue,
    verificationService,
    type CaseAttempts,
    type KycCaseType,
    type VerificationAttempt,
} from "@/services/verification";
import { ResendOnBackupButton, type BackupState } from "./resend-on-backup";

/** `GET /verification/attempts` for one case — the case page reads it once and hands it to the panel and the Digio card. */
export function useCaseAttempts(caseType: KycCaseType, caseId: string | null | undefined): ApiResource<CaseAttempts | null> {
    const live = isLive("kyc");
    return useApiResource<CaseAttempts | null>(`verification:attempts:${caseType}:${caseId ?? ""}:${live}`, () =>
        live && caseId ? verificationService.attempts(caseType, caseId) : Promise.resolve(null)
    );
}

/** The backup's state for the case, off the attempts read; null before it lands. */
export function backupStateOf(caseType: KycCaseType, caseId: string | null | undefined, data: CaseAttempts | null): BackupState | null {
    if (!data?.backup || !caseId) return null;
    return { caseType, caseId, available: data.backup.available === true, setting: data.backup.setting === "ON" ? "ON" : "OFF" };
}

/**
 * "Verification checks" — Cashfree Phase 2, on every KYC case page.
 *
 * Every provider call made for the case, newest first: the provider, the
 * check, its status, whether the provider ANSWERED (errorClass BUSINESS —
 * a definite no is final) or could not answer (any other class, printed),
 * the failure code, the latency, the name score and when. The sessions
 * ADX's own screens opened for the case are a compact step list. `result`
 * is PII-minimised by the server and shown collapsed, key by key. "Resend
 * on backup" sits in the header while the backup can be sent.
 */
export function VerificationChecksPanel({
    caseType,
    caseId,
    resource,
}: {
    caseType: KycCaseType;
    caseId: string | null | undefined;
    resource: ApiResource<CaseAttempts | null>;
}) {
    if (!isLive("kyc") || !caseId) return null;
    const data = resource.data;
    const backup = data?.backup ?? null;
    const backupState = backupStateOf(caseType, caseId, data);
    const attempts = [...(data?.attempts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sessions = data?.sessions ?? [];

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="verification-checks">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification checks</h3>
                    {backup && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Backup for KYC is {backup.setting === "ON" ? "on" : "off"}
                            {backup.setting === "ON" && !backup.available ? " — it can't be sent for this case right now." : "."}
                        </p>
                    )}
                </div>
                {backupState && <ResendOnBackupButton backup={backupState} onSent={resource.reload} />}
            </div>

            {resource.loading && !data ? (
                <p className="mt-3 text-sm text-muted-foreground">Reading the provider calls…</p>
            ) : resource.error ? (
                <p className="mt-3 text-sm text-danger">{resource.error}</p>
            ) : (
                <div className="mt-3 space-y-4">
                    {sessions.length > 0 && (
                        <div className="space-y-2" data-testid="verification-sessions">
                            {sessions.map((session) => (
                                <div key={session.id} className="rounded-md border border-border p-3" data-testid={`verification-session-${session.id}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs font-medium text-foreground">ADX&apos;s own check · opened {formatDateTime(session.createdAt)}</p>
                                        <StatusBadge status={SESSION_STATUS_META[session.status] ?? { label: session.status, tone: "neutral" }} />
                                    </div>
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                        {session.steps.map((step) => (
                                            <li key={step.check} className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={step.failureCode ?? undefined}>
                                                <span className="text-foreground">{checkLabel(step.check)}</span>
                                                <StatusBadge status={STEP_STATUS_META[step.status] ?? { label: step.status, tone: "neutral" }} />
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}

                    {attempts.length === 0 ? (
                        <p className="text-sm text-muted-foreground" data-testid="verification-checks-empty">
                            No provider calls yet.
                        </p>
                    ) : (
                        <ol className="space-y-2" data-testid="verification-attempts">
                            {attempts.map((attempt) => (
                                <AttemptRow key={attempt.id} attempt={attempt} />
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </Card>
    );
}

function AttemptRow({ attempt }: { attempt: VerificationAttempt }) {
    const answered = answeredByProvider(attempt);
    const entries = Object.entries(attempt.result ?? {});
    return (
        <li className="rounded-md bg-muted/40 px-3 py-2" data-testid={`verification-attempt-${attempt.id}`}>
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={{ label: attempt.providerLabel, tone: attempt.provider === "DIGIO" ? "info" : "neutral" }} />
                <span className="text-sm font-medium text-foreground">
                    {checkLabel(attempt.checkType)}
                    {attempt.attemptNo > 1 ? ` · try ${attempt.attemptNo}` : ""}
                </span>
                <StatusBadge status={ATTEMPT_STATUS_META[attempt.status] ?? { label: attempt.status, tone: "neutral" }} />
                {attempt.errorClass &&
                    (answered ? (
                        <span className="text-xs text-muted-foreground">Answered no</span>
                    ) : (
                        <span className="text-xs text-warning" data-testid="attempt-technical">
                            Couldn&apos;t answer · {attempt.errorClass}
                        </span>
                    ))}
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(attempt.createdAt)}</span>
            </div>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {attempt.failureCode && (
                    <div>
                        <dt className="inline">Code </dt>
                        <dd className="inline font-mono text-foreground">{attempt.failureCode}</dd>
                    </div>
                )}
                <div>
                    <dt className="inline">Latency </dt>
                    <dd className="inline tabular-nums text-foreground">{formatLatency(attempt.latencyMs)}</dd>
                </div>
                {attempt.nameMatchScore !== null && (
                    <div>
                        <dt className="inline">Name score </dt>
                        <dd className="inline tabular-nums text-foreground">{attempt.nameMatchScore}</dd>
                    </div>
                )}
            </dl>
            {entries.length > 0 && (
                <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">What the provider returned</summary>
                    <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                        {entries.map(([key, value]) => (
                            <div key={key} className="flex min-w-0 gap-2">
                                <dt className="shrink-0 text-muted-foreground">{key}</dt>
                                <dd className="truncate font-mono text-foreground" title={resultValue(value)}>
                                    {resultValue(value)}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </details>
            )}
        </li>
    );
}
