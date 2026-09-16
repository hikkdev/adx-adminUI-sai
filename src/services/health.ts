import { ApiError, api as http } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import type { StatusMeta } from "@/types";

/**
 * Readiness — `GET /health/ready`, owned by the backend's bootstrap rather
 * than by any module because it reports on the process, not on a domain.
 *
 * Read directly rather than through `apiFetch` for two reasons. It is
 * unauthenticated, so there is no token to attach and no session to end on a
 * 401. And a 503 is the interesting answer: the body still says which of
 * postgres and redis failed, and the client's envelope handling would throw
 * that body away as an error before the page could draw it.
 */

export type Probe = { ok: true; latencyMs: number } | { ok: false; error: string };

export interface Readiness {
    ok: boolean;
    postgres: Probe;
    redis: Probe;
    /** Seconds the process has been up. */
    uptime: number;
}

/** "3d 4h", "2h 15m", "40s" — an uptime, in the two largest units that apply. */
export function uptimeLabel(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3_600);
    const minutes = Math.floor((total % 3_600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${total % 60}s`;
    return `${total}s`;
}

/** This panel reads the API or says it cannot; a seeded "operational" would be a claim about production. */
export const healthReadsApi = (): boolean => apiConfig.live;

/* ------------------------------------------------------------------ */
/* Ops health — Lot E's `/settings/system-health/ops` and `/history`   */
/* ------------------------------------------------------------------ */

/**
 * `GET /settings/system-health/ops` — the four questions the on-call admin
 * asks before anything else: is there a recent dump, did the last drill
 * pass, what has retention flagged, and is every job still ticking. Every
 * number comes from something a job or a script already wrote; the console
 * computes nothing here beyond the label.
 */
export interface OpsHealth {
    /** Decision 95: stated on the page so the numbers are read against them. */
    targets: { rpoHours: number; rtoHours: number };
    backup: {
        last: { name: string; takenAt: string | null; size: number } | null;
        count: number;
        ageHours: number | null;
        /** Older than the backend's `BACKUP_STALE_HOURS`, or missing. */
        stale: boolean;
        rotationDays: number;
        /** The storage listing failed; `last` is then null for a different reason. */
        error?: string;
    };
    drill: {
        ranAt: string;
        status: "PASSED" | "FAILED";
        dump: { name: string; size: number } | null;
        durationMs: number;
        ledger: unknown;
        warnings: string | null;
        error: string | null;
    } | null;
    retention: { dueCount: number; generatedAt: string | null; erasureOverdue: number };
    jobs: JobHeartbeat[];
    /** G11-2: the public status page's subscribers — `StatusSubscriber` rows with `confirmedAt` set, and those still waiting on the mailbox. Absent on a backend older than the field. */
    subscribers?: { confirmed: number; pending: number };
}

/** One job's last tick, with the backend's own staleness verdict. */
export interface JobHeartbeat {
    job: string;
    lastTickAt: string | null;
    staleMinutes: number | null;
    stale: boolean;
}

/**
 * `GET /settings/system-health/history` — what the page draws as a line
 * rather than a light: every job's last tick and the last thirty days of
 * 5xx counts, oldest first. A day with no field is a zero, so the series is
 * always the backend's `days` long once the hash exists at all.
 */
export interface SystemHealthHistory {
    generatedAt: string;
    jobs: JobHeartbeat[];
    serverErrors: {
        days: number;
        /** Oldest first. */
        series: { day: string; count: number }[];
        total: number;
        source: "redis";
    };
    /**
     * Lot G (Q130): thirty Indian days of the five-minute samples, per
     * service — `okPct` the share of samples that passed, `p95Ms` the p95
     * of the sampled latency (null for JOBS, which carries none). A day
     * with no samples reads null rather than being left out. Optional on
     * the read for a backend older than the sampler.
     */
    services?: Partial<Record<HealthServiceName, { days: HealthDay[] }>>;
    sampleDays?: number;
}

/* ------------------------------------------------------------------ */
/* Lot G (Q130): the sampler, the incidents, the regions, the status page */
/* ------------------------------------------------------------------ */

export const HEALTH_SERVICES = ["API", "POSTGRES", "REDIS", "STORAGE", "JOBS"] as const;
export type HealthServiceName = (typeof HEALTH_SERVICES)[number];

export const HEALTH_SERVICE_LABEL: Record<HealthServiceName, string> = {
    API: "API",
    POSTGRES: "Postgres",
    REDIS: "Redis",
    STORAGE: "Storage",
    JOBS: "Background jobs",
};

/** One Indian day of a service's samples. */
export interface HealthDay {
    date: string;
    okPct: number | null;
    p95Ms: number | null;
}

export const INCIDENT_STATUSES = ["OPEN", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUS_META: Record<IncidentStatus, StatusMeta> = {
    OPEN: { label: "Investigating", tone: "warning" },
    MONITORING: { label: "Monitoring", tone: "info" },
    RESOLVED: { label: "Resolved", tone: "success" },
};

export const INCIDENT_SEVERITY_META: Record<IncidentSeverity, StatusMeta> = {
    MINOR: { label: "Minor", tone: "neutral" },
    MAJOR: { label: "Major", tone: "warning" },
    CRITICAL: { label: "Critical", tone: "danger" },
};

export interface IncidentUpdate {
    id: string;
    incidentId: string;
    status: IncidentStatus;
    body: string;
    byUserId: string;
    at: string;
}

/**
 * An incident as ops declared it — `GET/POST /settings/system-health/
 * incidents`. Its status follows its newest update; RESOLVED stamps
 * `resolvedAt`, a later non-RESOLVED update clears it (an incident can be
 * reopened). An open one naming a service raises that service on the
 * public status page to at least DEGRADED, CRITICAL to OUTAGE — ops' word
 * outranks a passing probe.
 */
export interface Incident {
    id: string;
    title: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    body: string;
    services: HealthServiceName[];
    startedAt: string;
    resolvedAt: string | null;
    createdById: string;
    createdAt: string;
    updatedAt: string;
    /** Oldest first. */
    updates: IncidentUpdate[];
}

/** One page of the designed-list contract over incidents. */
export interface IncidentsPage {
    items: Incident[];
    total: number;
    page: number;
    pageSize: number;
    counts: Record<string, number>;
}

export interface IncidentsQuery {
    q?: string;
    status?: readonly IncidentStatus[];
    sort?: "newest" | "oldest";
    service?: HealthServiceName;
    page?: number;
    pageSize?: number;
}

/** `?q=&status=&sort=&service=&page=&pageSize=` for the incident list, blanks left off. */
export function incidentsQuery(query: IncidentsQuery = {}): string {
    const params = new URLSearchParams();
    const q = query.q?.trim();
    if (q) params.set("q", q);
    if (query.status?.length) params.set("status", query.status.join(","));
    if (query.sort) params.set("sort", query.sort);
    if (query.service) params.set("service", query.service);
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    return params.toString();
}

export interface NewIncident {
    title: string;
    severity: IncidentSeverity;
    services: HealthServiceName[];
    body: string;
    /** ISO; defaults to now on the server. */
    startedAt?: string;
}

export interface IncidentPatch {
    title?: string;
    severity?: IncidentSeverity;
    services?: HealthServiceName[];
    /** The one status a PATCH may set; the body is then the closing note. */
    status?: "RESOLVED";
    body?: string;
}

/** The server's bounds, said before the round trip: a title of 3–140, a body of 3–4,000. */
export function incidentProblem(input: { title: string; body: string }): string | null {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 3 || title.length > 140) return "The title is 3 to 140 characters.";
    if (body.length < 3 || body.length > 4000) return "The note is 3 to 4,000 characters.";
    return null;
}

/** One region's live round trips — `GET /settings/system-health/regions`. One region until there is a second deployment. */
export interface RegionStatus {
    region: string;
    current: boolean;
    latency: { postgresMs: number | null; redisMs: number | null; apiP95Ms: number | null };
    /** G13-B: the 5xx share of the requests served over the last 24 h, two places; null with nothing served. Absent on a server one release behind. */
    errorRatePct?: number | null;
    /** G13-B: when the newest incident naming any service started, resolved or not; null with none. */
    lastIncidentAt?: string | null;
    checkedAt: string;
}

/**
 * G13-B/C: the regions table's Error rate column — the server's 24-hour 5xx
 * share printed to two places ("0.12%"), "0%" for a clean day, and "—" while
 * nothing was served or the server does not answer it. The tone is the
 * console's reading of the share: red from one in a hundred, amber from one
 * in a thousand.
 */
export function regionErrorRate(region: Pick<RegionStatus, "errorRatePct">): { text: string; tone: "success" | "warning" | "danger" | "neutral" } {
    const pct = region.errorRatePct;
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return { text: "—", tone: "neutral" };
    const text = `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
    return { text, tone: pct >= 1 ? "danger" : pct >= 0.1 ? "warning" : "success" };
}

/** The Last incident column: the moment as an ISO string, or null for "none yet" — the view prints it with `formatDateTime`. */
export const regionLastIncident = (region: Pick<RegionStatus, "lastIncidentAt">): string | null => region.lastIncidentAt ?? null;

/**
 * One bar of a service's 30-day strip, from the day's `okPct`: green when
 * every sample passed, amber when some failed, red when most did, grey
 * when no sample was taken. The threshold reading is the console's — the
 * server carries a share, not a verdict — and it is pinned in the test.
 */
export interface ServiceDayBar {
    date: string;
    okPct: number | null;
    p95Ms: number | null;
    tone: "success" | "warning" | "danger" | "neutral";
}

export function serviceBars(days: readonly HealthDay[] | undefined): ServiceDayBar[] {
    if (!days) return [];
    return days.map((day) => ({
        date: day.date,
        okPct: day.okPct,
        p95Ms: day.p95Ms,
        tone: day.okPct === null ? "neutral" : day.okPct >= 100 ? "success" : day.okPct >= 50 ? "warning" : "danger",
    }));
}

/**
 * The share of sampled days that passed in full, over the days that were
 * sampled at all — the number the banner prints as uptime. Null when no
 * day carries a sample.
 */
export function uptimePct(days: readonly HealthDay[] | undefined): number | null {
    const sampled = (days ?? []).filter((day) => day.okPct !== null);
    if (sampled.length === 0) return null;
    const sum = sampled.reduce((total, day) => total + (day.okPct ?? 0), 0);
    return Math.round((sum / sampled.length) * 100) / 100;
}

/**
 * `GET /status` — the public page's own read: a status per service from
 * its newest sample and any open incident naming it (OPERATIONAL /
 * DEGRADED / OUTAGE / UNKNOWN), the latency it sampled, and the open
 * incidents. Says only what a status page says: no detail, no user id,
 * no count of anything — so there is no subscriber count to show.
 */
export type PublicServiceStatus = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "UNKNOWN";

export interface PublicStatus {
    region: string;
    generatedAt: string;
    overall: PublicServiceStatus;
    services: { service: HealthServiceName; status: PublicServiceStatus; latencyMs: number | null; sampledAt: string | null }[];
    incidents: { id: string; title: string; severity: IncidentSeverity; status: IncidentStatus; services: HealthServiceName[]; startedAt: string }[];
}

export const PUBLIC_STATUS_META: Record<PublicServiceStatus, StatusMeta> = {
    OPERATIONAL: { label: "Operational", tone: "success" },
    DEGRADED: { label: "Degraded", tone: "warning" },
    OUTAGE: { label: "Outage", tone: "danger" },
    UNKNOWN: { label: "Unknown", tone: "neutral" },
};

/**
 * Where the public status page lives: the backend's root, not `/api/v1` —
 * `GET /status` and `POST /status/subscribe` are root-mounted so they work
 * during an outage for people with no account.
 */
export function publicStatusUrl(): string {
    return `${apiConfig.baseUrl.replace(/\/api\/v1$/, "")}/status`;
}

/** "3h", "26h", "2d 4h" — a dump's age in the two largest units that apply. */
export function ageLabel(hours: number): string {
    const total = Math.max(0, Math.floor(hours));
    const days = Math.floor(total / 24);
    if (days > 0) return `${days}d ${total % 24}h`;
    return `${total}h`;
}

/** Bytes as the page prints them. */
export function sizeLabel(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

const OK: StatusMeta = { label: "Operational", tone: "success" };
const LATE: StatusMeta = { label: "Late", tone: "warning" };
const FAILED: StatusMeta = { label: "Failed", tone: "danger" };
const NONE: StatusMeta = { label: "None yet", tone: "neutral" };

/** One of the frame's service cards: a name, a pill, one big number and its caption. */
export interface OpsCard {
    id: "backup" | "drill" | "retention" | "jobs";
    name: string;
    status: StatusMeta;
    metric: string;
    metricLabel: string;
    /** A second line under the caption, when there is something to say. */
    detail?: string;
}

/**
 * The ops read as four cards, in the frame's shape. Pure, so the reading of
 * each field can be pinned: a stale dump is "Late" rather than "Outage",
 * because the API is up — it is the housekeeping that has not run.
 */
export function opsCards(ops: OpsHealth): OpsCard[] {
    const { backup, drill, retention, jobs } = ops;

    const backupCard: OpsCard = backup.error
        ? {
              id: "backup",
              name: "Backups",
              status: FAILED,
              metric: "Unknown",
              metricLabel: "the dump folder could not be listed",
              detail: backup.error,
          }
        : !backup.last
          ? {
                id: "backup",
                name: "Backups",
                status: LATE,
                metric: "None",
                metricLabel: "no dump in storage",
                detail: `Nightly, kept ${backup.rotationDays} days · RPO target ${ops.targets.rpoHours}h`,
            }
          : {
                id: "backup",
                name: "Backups",
                status: backup.stale ? LATE : OK,
                metric: backup.ageHours === null ? "—" : `${ageLabel(backup.ageHours)} ago`,
                metricLabel: backup.last.takenAt ? `last dump, ${sizeLabel(backup.last.size)}` : backup.last.name,
                detail: `${backup.count} kept over ${backup.rotationDays} days · RPO target ${ops.targets.rpoHours}h`,
            };

    const drillCard: OpsCard = drill
        ? {
              id: "drill",
              name: "Restore drill",
              status: drill.status === "PASSED" ? OK : FAILED,
              metric: drill.status === "PASSED" ? "Passed" : "Failed",
              metricLabel: `${Math.round(drill.durationMs / 1000)}s restore${drill.dump ? ` of ${drill.dump.name}` : ""}`,
              detail: drill.error ?? drill.warnings ?? `RTO target ${ops.targets.rtoHours}h`,
          }
        : {
              id: "drill",
              name: "Restore drill",
              status: NONE,
              metric: "Never run",
              metricLabel: "no drill on record",
              detail: `RTO target ${ops.targets.rtoHours}h`,
          };

    const retentionCard: OpsCard = {
        id: "retention",
        name: "Retention",
        status:
            retention.erasureOverdue > 0
                ? { label: "Overdue", tone: "danger" }
                : retention.dueCount > 0
                  ? { label: "Due", tone: "warning" }
                  : OK,
        metric: String(retention.dueCount),
        metricLabel: retention.dueCount === 1 ? "record due for deletion" : "records due for deletion",
        detail:
            retention.erasureOverdue > 0
                ? `${retention.erasureOverdue} erasure ${retention.erasureOverdue === 1 ? "request" : "requests"} past its thirty days`
                : retention.generatedAt
                  ? "counted by the nightly sweep"
                  : "the sweep has not run yet",
    };

    const stale = jobs.filter((job) => job.stale);
    const jobsCard: OpsCard = {
        id: "jobs",
        name: "Background jobs",
        status: jobs.length === 0 ? NONE : stale.length ? { label: "Stalled", tone: "danger" } : OK,
        metric: jobs.length === 0 ? "None" : `${jobs.length - stale.length} of ${jobs.length}`,
        metricLabel: jobs.length === 0 ? "no heartbeat recorded" : "ticking",
        detail: stale.length ? `Silent: ${stale.map((job) => job.job).join(", ")}` : undefined,
    };

    return [backupCard, drillCard, retentionCard, jobsCard];
}

/** One bar of the frame's 30-day strip: the day, its count and the tone that draws it. */
export interface HistoryBar {
    day: string;
    count: number;
    tone: "success" | "danger";
}

/**
 * The 5xx series as bars, oldest first — the one series the backend keeps,
 * so the one strip the frame's cards get. A zero day is green; a day with
 * any server error is red. Empty when there is no series to draw.
 */
export function historyBars(history: SystemHealthHistory | null): HistoryBar[] {
    if (!history || history.serverErrors.series.length === 0) return [];
    return history.serverErrors.series.map(({ day, count }) => ({
        day,
        count,
        tone: count > 0 ? "danger" : "success",
    }));
}

export const healthService = {
    ready: async (): Promise<Readiness> => {
        let response: Response;
        try {
            response = await fetch(`${apiConfig.baseUrl}/health/ready`, { signal: AbortSignal.timeout(15_000) });
        } catch {
            throw new ApiError(0, "NETWORK", "Could not reach the ADX backend.");
        }
        let payload: { data?: Readiness } | undefined;
        try {
            payload = (await response.json()) as { data?: Readiness };
        } catch {
            throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
        }
        if (!payload?.data) throw new ApiError(response.status, "BAD_RESPONSE", "The readiness probe sent no data.");
        return payload.data;
    },

    /** The housekeeping, in one read. ADMIN only, through the ordinary client. */
    ops: () => http.get<OpsHealth>("/settings/system-health/ops"),

    /** The heartbeats, the 30-day 5xx series and, since Lot G, every service's 30 days of samples. */
    history: () => http.get<SystemHealthHistory>("/settings/system-health/history"),

    /* ---------------- Lot G (Q130) ---------------- */

    /** The public status page's read, anonymous at the backend's root — the sampler's verdict per service. */
    status: async (): Promise<PublicStatus> => {
        let response: Response;
        try {
            response = await fetch(publicStatusUrl(), { signal: AbortSignal.timeout(15_000) });
        } catch {
            throw new ApiError(0, "NETWORK", "Could not reach the ADX backend.");
        }
        let payload: { data?: PublicStatus } | undefined;
        try {
            payload = (await response.json()) as { data?: PublicStatus };
        } catch {
            throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
        }
        if (!response.ok || !payload?.data) throw new ApiError(response.status, "BAD_RESPONSE", "The status page sent no data.");
        return payload.data;
    },

    /** The one region this process runs in, with a live round trip to each store. */
    regions: () => http.get<{ regions: RegionStatus[] }>("/settings/system-health/regions"),

    incidents: (query: IncidentsQuery = {}) => http.get<IncidentsPage>(`/settings/system-health/incidents?${incidentsQuery(query)}`),

    incident: (id: string) => http.get<Incident>(`/settings/system-health/incidents/${encodeURIComponent(id)}`),

    /** Opens an incident with its first update. Every admin is told in-app; every confirmed subscriber is mailed. Audited `INCIDENT_CREATED`. */
    createIncident: (input: NewIncident) => http.post<Incident>("/settings/system-health/incidents", input),

    /** A dated note; the incident's status follows it. RESOLVED stamps `resolvedAt`; a later non-RESOLVED update reopens. Audited `INCIDENT_UPDATED` / `INCIDENT_RESOLVED`. */
    addIncidentUpdate: (id: string, update: { status: IncidentStatus; body: string }) =>
        http.post<Incident>(`/settings/system-health/incidents/${encodeURIComponent(id)}/updates`, update),

    /** An edit, or "resolve" with a closing note (`status: 'RESOLVED'` + `body`). Audited `INCIDENT_EDITED` / `INCIDENT_RESOLVED`. */
    patchIncident: (id: string, patch: IncidentPatch) =>
        http.patch<Incident>(`/settings/system-health/incidents/${encodeURIComponent(id)}`, patch),

    /**
     * `POST /status/subscribe` — the public status page's own form, called
     * anonymously at the backend's root. Answers 202 whether or not the
     * address was new: a confirmation mail goes to a new or unconfirmed
     * one, and the answer never says which. Read directly, like the
     * readiness probe, because the route is not under `/api/v1`.
     */
    subscribe: async (email: string): Promise<{ message: string }> => {
        let response: Response;
        try {
            response = await fetch(`${publicStatusUrl()}/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
                signal: AbortSignal.timeout(15_000),
            });
        } catch {
            throw new ApiError(0, "NETWORK", "Could not reach the ADX backend.");
        }
        let payload: { data?: { message?: string }; error?: { code?: string; message?: string } } | undefined;
        try {
            payload = (await response.json()) as typeof payload;
        } catch {
            throw new ApiError(response.status, "BAD_RESPONSE", "The server sent an unreadable response.");
        }
        if (!response.ok) {
            throw new ApiError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "The subscription was refused.");
        }
        return { message: payload?.data?.message ?? "If this address is new, a confirmation email is on its way." };
    },
};
