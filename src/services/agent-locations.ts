import { api as http } from "@/lib/api-client";
import { apiConfig, isLive } from "@/lib/api-config";
import { openStream, type StreamHandle, type StreamOptions } from "@/services/live-chat";
import type { StatusMeta } from "@/types";

/**
 * LT-1 (live agent tracking, 22 Sep 2026): the ops live map — every active
 * agent's position and state, the alerts, one agent's trail, the order
 * timeline across both legs — over `/agent-locations/*`. Live only: a
 * fixture agent on a map would be a lie about where a person is.
 */

export type AgentState = "OFFLINE" | "AVAILABLE" | "TRAVELLING" | "ON_SITE" | "STILL";
export type AlertKind = "IDLE" | "LATE" | "OFF_ROUTE" | "OFFLINE";
export type TrailKind = "ORDER" | "MILESTONE" | "FIELD_VISIT";

export const AGENT_STATES: AgentState[] = ["TRAVELLING", "STILL", "ON_SITE", "AVAILABLE", "OFFLINE"];

export const AGENT_STATE_META: Record<AgentState, StatusMeta & { tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
    TRAVELLING: { label: "On the way", tone: "info" },
    STILL: { label: "Stopped", tone: "warning" },
    ON_SITE: { label: "On site", tone: "success" },
    AVAILABLE: { label: "Available", tone: "success" },
    OFFLINE: { label: "Offline", tone: "neutral" },
};

export const ALERT_META: Record<AlertKind, { label: string; tone: "warning" | "danger" }> = {
    IDLE: { label: "Idle", tone: "warning" },
    LATE: { label: "Late", tone: "danger" },
    OFF_ROUTE: { label: "Off route", tone: "warning" },
    OFFLINE: { label: "Gone dark", tone: "danger" },
};

export interface LatLng {
    latitude: number;
    longitude: number;
}

export interface LiveAgent {
    agent: { id: string; displayId: string | null; userId: string; name: string; mobile: string; city: string | null; sides: ("PUBLISHER" | "ADVERTISER")[]; status: string; stage: string };
    state: AgentState;
    fix: (LatLng & { at: string; accuracy: number | null; speed: number | null; heading: number | null; ageSec: number }) | null;
    trip: { kind: TrailKind; id: string; orderId: string | null; label: string; destination: LatLng | null; slotAt: string | null; arrivedAt: string | null; eta: { minutes: number; distanceM: number } | null } | null;
    alerts: { kind: AlertKind; since: string | null; detail: string }[];
}

export interface LiveSnapshot {
    agents: LiveAgent[];
    counts: Record<AgentState, number>;
    alerts: number;
    at: string;
}

export interface TrailView {
    id: string;
    kind: TrailKind;
    contextId: string;
    orderId: string | null;
    label: string | null;
    destination: LatLng | null;
    startedAt: string;
    lastFixAt: string;
    arrivedAt: string | null;
    endedAt: string | null;
    pointCount: number;
    distanceM: number;
    points: (LatLng & { at: string; speed: number | null })[];
}

export interface TimelineStep {
    key: "PRINT_READY" | "TO_PARTNER" | "PICKUP" | "TO_SITE" | "ARRIVED" | "INSTALLED";
    label: string;
    at: string | null;
    source: "order" | "print-job" | "trail" | "milestone";
    done: boolean;
}

export interface OrderTimeline {
    order: { id: string; reference: string | null; status: string; agentId: string | null; slotTime: string | null; site: { title: string; point: LatLng | null } };
    steps: TimelineStep[];
    trails: TrailView[];
    live: LiveAgent | null;
}

export interface LiveFilter {
    city?: string;
    side?: "PUBLISHER" | "ADVERTISER";
    state?: AgentState;
    q?: string;
}

export const liveMapReadApi = (): boolean => isLive("agents");

/** "2 min ago", "just now", "1 h ago" — the age of a fix, as the list prints it. */
export function ageLabel(ageSec: number): string {
    if (ageSec < 45) return "just now";
    if (ageSec < 3600) return `${Math.round(ageSec / 60)} min ago`;
    if (ageSec < 86400) return `${Math.round(ageSec / 3600)} h ago`;
    return `${Math.round(ageSec / 86400)} d ago`;
}

/** "4.8 km · about 12 min" for a trip's ETA, or null. */
export function etaLabel(eta: { minutes: number; distanceM: number } | null | undefined): string | null {
    if (!eta) return null;
    const km = eta.distanceM >= 1000 ? `${(eta.distanceM / 1000).toFixed(1)} km` : `${eta.distanceM} m`;
    return `${km} · about ${eta.minutes} min`;
}

/** The marker tone for an agent: an alert paints it, else the state does. */
export function markerToneOf(row: Pick<LiveAgent, "state" | "alerts">): "success" | "warning" | "danger" | "info" | "neutral" {
    if (row.alerts.some((a) => a.kind === "LATE" || a.kind === "OFFLINE")) return "danger";
    if (row.alerts.length > 0) return "warning";
    return AGENT_STATE_META[row.state].tone;
}

function query(filter: LiveFilter): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, String(value));
    const text = params.toString();
    return text ? `?${text}` : "";
}

export const agentLocationsService = {
    live: (filter: LiveFilter = {}) => http.get<LiveSnapshot>(`/agent-locations/live${query(filter)}`),
    trail: (agentId: string) => http.get<TrailView | null>(`/agent-locations/agents/${encodeURIComponent(agentId)}/trail`),
    orderTimeline: (orderId: string) => http.get<OrderTimeline>(`/agent-locations/orders/${encodeURIComponent(orderId)}/timeline`),
    streamToken: () => http.post<{ token: string; expiresInSec: number }>("/agent-locations/stream-token", {}),
    /** The live stream: a `snapshot` whenever the map would change. Single-use token per connection, the console's own reconnect. */
    stream: (filter: LiveFilter, onSnapshot: (snapshot: LiveSnapshot) => void, options: Pick<StreamOptions<never>, "onPhase" | "factory" | "retryMs"> = {}): StreamHandle =>
        openStream<LiveSnapshot & { type: string }>({
            mintToken: async () => (await agentLocationsService.streamToken()).token,
            url: `${apiConfig.baseUrl}/agent-locations/stream${query(filter)}`,
            events: ["snapshot"],
            onEvent: (event) => {
                if (event.type === "snapshot") onSnapshot(event);
            },
            ...options,
        }),
};
