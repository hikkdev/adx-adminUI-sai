"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import {
    HEALTH_SERVICES,
    HEALTH_SERVICE_LABEL,
    INCIDENT_SEVERITIES,
    INCIDENT_SEVERITY_META,
    INCIDENT_STATUSES,
    INCIDENT_STATUS_META,
    healthService,
    incidentProblem,
    type HealthServiceName,
    type Incident,
    type IncidentSeverity,
    type IncidentStatus,
} from "@/services/health";

/**
 * Lot G (Q130): declaring an incident — `POST /settings/system-health/
 * incidents`. The first note is its first update; every admin is told
 * in-app and every confirmed subscriber of the public status page is
 * mailed, so the dialog says so before the button.
 */
export function DeclareIncidentDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
    const [title, setTitle] = React.useState("");
    const [severity, setSeverity] = React.useState<IncidentSeverity>("MINOR");
    const [services, setServices] = React.useState<HealthServiceName[]>([]);
    const [body, setBody] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const problem = incidentProblem({ title, body });

    const toggle = (service: HealthServiceName) =>
        setServices((current) => (current.includes(service) ? current.filter((item) => item !== service) : [...current, service]));

    const submit = async () => {
        if (problem) {
            toast.error(problem);
            return;
        }
        setBusy(true);
        try {
            const incident = await healthService.createIncident({ title: title.trim(), severity, services, body: body.trim() });
            toast.success(`Incident opened: ${incident.title}`, {
                description: "Every admin has been told in-app and every confirmed status subscriber mailed. The public page reflects it now.",
            });
            setTitle("");
            setBody("");
            setServices([]);
            setSeverity("MINOR");
            onOpenChange(false);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not open the incident.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Declare an incident</DialogTitle>
                    <DialogDescription>
                        Goes on the public status page at once and mails every confirmed subscriber. A service named here reads at least Degraded
                        there, Critical as an Outage, until the incident is resolved.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="inc-title">Title</Label>
                        <Input id="inc-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Order dispatch delayed by 30 to 60s" maxLength={140} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="inc-severity">Severity</Label>
                            <Select value={severity} onValueChange={(value) => setSeverity(value as IncidentSeverity)}>
                                <SelectTrigger id="inc-severity">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INCIDENT_SEVERITIES.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {INCIDENT_SEVERITY_META[value].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Services affected</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {HEALTH_SERVICES.map((service) => {
                                    const on = services.includes(service);
                                    return (
                                        <button
                                            key={service}
                                            type="button"
                                            onClick={() => toggle(service)}
                                            aria-pressed={on}
                                            className={
                                                on
                                                    ? "rounded-full border border-foreground bg-foreground px-2.5 py-1 text-xs font-medium text-background"
                                                    : "rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                            }
                                        >
                                            {HEALTH_SERVICE_LABEL[service]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="inc-body">First update</Label>
                        <Textarea id="inc-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Investigating reports of delayed order dispatch." maxLength={4000} />
                        <p className="text-xs text-muted-foreground">What is known now. Later notes go on as updates; the last one closes it.</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy || problem !== null}>
                        {busy ? "Opening…" : "Open incident"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * A dated note on an open incident — `POST …/incidents/:id/updates`. The
 * incident's status follows the note's: RESOLVED closes it and stamps
 * `resolvedAt`; a later Investigating or Monitoring note reopens it.
 */
export function IncidentUpdateDialog({
    incident,
    initialStatus,
    onOpenChange,
    onSaved,
}: {
    incident: Incident | null;
    /** What the button that opened this asked for — Resolve opens on RESOLVED. */
    initialStatus: IncidentStatus;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    return (
        <Dialog open={incident !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {incident && <UpdateForm key={`${incident.id}:${initialStatus}`} incident={incident} initialStatus={initialStatus} onOpenChange={onOpenChange} onSaved={onSaved} />}
            </DialogContent>
        </Dialog>
    );
}

function UpdateForm({
    incident,
    initialStatus,
    onOpenChange,
    onSaved,
}: {
    incident: Incident;
    initialStatus: IncidentStatus;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const [status, setStatus] = React.useState<IncidentStatus>(initialStatus);
    const [body, setBody] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const problem = incidentProblem({ title: incident.title, body });

    const submit = async () => {
        if (problem) {
            toast.error(problem);
            return;
        }
        setBusy(true);
        try {
            const updated = await healthService.addIncidentUpdate(incident.id, { status, body: body.trim() });
            toast.success(
                updated.status === "RESOLVED" ? `Resolved: ${updated.title}` : `${INCIDENT_STATUS_META[updated.status].label}: ${updated.title}`,
                { description: "Every admin has been told and every confirmed subscriber mailed." },
            );
            onOpenChange(false);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "Could not add the update.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>{initialStatus === "RESOLVED" ? "Resolve the incident" : "Add an update"}</DialogTitle>
                <DialogDescription>{incident.title}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="upd-status">Status after this note</Label>
                    <Select value={status} onValueChange={(value) => setStatus(value as IncidentStatus)}>
                        <SelectTrigger id="upd-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {INCIDENT_STATUSES.map((value) => (
                                <SelectItem key={value} value={value}>
                                    {INCIDENT_STATUS_META[value].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        {status === "RESOLVED"
                            ? "Closes the incident and lifts the services it names back to what the probe says."
                            : incident.status === "RESOLVED"
                              ? "Reopens the incident on the public page."
                              : "The public page shows this note under the incident."}
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="upd-body">Note</Label>
                    <Textarea id="upd-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} autoFocus />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void submit()} disabled={busy || problem !== null}>
                    {busy ? "Saving…" : status === "RESOLVED" ? "Resolve" : "Post update"}
                </Button>
            </DialogFooter>
        </>
    );
}
