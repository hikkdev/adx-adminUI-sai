"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { CityCombobox } from "@/components/adx/city-combobox";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { agentService, type CreateAgentInput } from "@/services/agents";

type Side = CreateAgentInput["side"];

interface CreateAgentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Called after a successful create, so the roster behind the dialog refetches. */
    onCreated: () => void;
}

const SIDES: { value: Side; label: string; description: string }[] = [
    {
        value: "PUBLISHER",
        label: "Publisher side",
        description: "Onboards publishers door to door and lists their ad spots.",
    },
    {
        value: "ADVERTISER",
        label: "Advertiser side",
        description: "Onboards advertisers and sells packages and campaigns.",
    },
];

const EMPTY = { name: "", mobile: "", email: "", city: "", state: "" };

/**
 * Bringing an agent into existence.
 *
 * Ops creates them here, in person, and the person then signs in to the
 * field app with the number typed at this desk. AG-3: by default they start
 * as an application — the same ladder a rider who applied from the app
 * climbs (details, papers, payout account, terms, then the desk's review) —
 * and the dialog lands on their workbench. The switch off is the pre-AG-1
 * shortcut: active at once, for someone whose papers ADX already holds.
 *
 * The form asks for exactly what `POST /agents` takes and nothing more. The
 * identifier is minted server-side. A 400 comes back with per-field messages
 * from the schema and lands beside the field; a 409 means the number is
 * already an agent or the email belongs to somebody else, and the API says
 * which.
 */
export function CreateAgentDialog({ open, onOpenChange, onCreated }: CreateAgentDialogProps) {
    const router = useRouter();
    const live = isLive("agents");

    const [fields, setFields] = React.useState(EMPTY);
    const [side, setSide] = React.useState<Side>("PUBLISHER");
    const [asApplication, setAsApplication] = React.useState(true);
    const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
        setFields((current) => ({ ...current, [key]: event.target.value }));

    // The server normalises the number (ten digits become +91…), but it will
    // not strip the spaces people type between groups.
    const mobile = fields.mobile.replace(/\s+/g, "");
    const ready = fields.name.trim().length >= 2 && mobile.length >= 10;

    /** A fresh form for the next person at the desk, never the last one's number. */
    function reset() {
        setFields(EMPTY);
        setSide("PUBLISHER");
        setAsApplication(true);
        setFieldErrors({});
        setFormError(null);
    }

    function handleOpenChange(next: boolean) {
        if (!next) reset();
        onOpenChange(next);
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;

        // Optional fields go on the wire only when filled: the schema's
        // `email()` would refuse an empty string.
        const input: CreateAgentInput = {
            name: fields.name.trim(),
            mobile,
            side,
            asApplication,
            ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
            ...(fields.city.trim() ? { city: fields.city.trim() } : {}),
            ...(fields.state.trim() ? { state: fields.state.trim() } : {}),
        };

        setBusy(true);
        setFieldErrors({});
        setFormError(null);
        try {
            const agent = await agentService.create(input);
            if (asApplication) {
                toast.success(`${agent.name ?? agent.mobile} is applying${agent.displayId ? ` — ${agent.displayId}` : ""}`, {
                    description: `Fill in the rest at the desk, or they finish it in the field app with ${agent.mobile}.`,
                });
            } else {
                toast.success(`${agent.name ?? agent.mobile} is now an agent${agent.displayId ? ` — ${agent.displayId}` : ""}`, {
                    description: `They can sign in to the field app with ${agent.mobile}.`,
                });
            }
            reset();
            onOpenChange(false);
            onCreated();
            router.push(asApplication ? `/agents/applications/${agent.id}` : `/agents/${agent.id}`);
        } catch (cause) {
            if (cause instanceof ApiError) {
                setFieldErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not add the agent.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Add an agent</DialogTitle>
                        <DialogDescription>
                            The number you enter is the one they will sign in with; ADX issues their AGT identifier. They start as an application — the desk or
                            the field app finishes the rest — unless you switch that off.
                        </DialogDescription>
                    </DialogHeader>

                    {!live && (
                        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                            The console is not connected to the ADX backend, so nobody can be created from here right now.
                        </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="agent-name" label="Full name" errors={fieldErrors.name}>
                            <Input id="agent-name" value={fields.name} onChange={set("name")} autoComplete="off" placeholder="Rahul Kumar" />
                        </Field>
                        <Field id="agent-mobile" label="Mobile number" errors={fieldErrors.mobile}>
                            <Input
                                id="agent-mobile"
                                inputMode="tel"
                                value={fields.mobile}
                                onChange={set("mobile")}
                                autoComplete="off"
                                placeholder="98765 43210"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-1.5">
                        <Label>Works on</Label>
                        <RadioGroup value={side} onValueChange={(value) => setSide(value as Side)} className="grid gap-2 sm:grid-cols-2">
                            {SIDES.map((option) => (
                                <label
                                    key={option.value}
                                    htmlFor={`side-${option.value}`}
                                    className="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left"
                                >
                                    <RadioGroupItem id={`side-${option.value}`} value={option.value} className="mt-0.5" />
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">{option.label}</span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
                                    </span>
                                </label>
                            ))}
                        </RadioGroup>
                        {fieldErrors.side?.[0] && <p className="text-xs text-danger">{fieldErrors.side[0]}</p>}
                    </div>

                    <Field id="agent-email" label="Email" optional errors={fieldErrors.email}>
                        <Input id="agent-email" type="email" value={fields.email} onChange={set("email")} autoComplete="off" placeholder="rahul@example.in" />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="agent-city" label="City" optional errors={fieldErrors.city}>
                            <CityCombobox
                                id="agent-city"
                                value={fields.city}
                                onChange={(city, picked) =>
                                    setFields((current) => ({
                                        ...current,
                                        city,
                                        state: picked ? (picked.geoState?.name ?? picked.state ?? current.state) : current.state,
                                    }))
                                }
                                stages={["LAUNCHED", "SEEDING"]}
                                placeholder="Bengaluru"
                            />
                        </Field>
                        <Field id="agent-state" label="State" optional errors={fieldErrors.state}>
                            <Input id="agent-state" value={fields.state} onChange={set("state")} autoComplete="off" placeholder="Karnataka" />
                        </Field>
                    </div>

                    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-card p-3" htmlFor="agent-as-application">
                        <span>
                            <span className="block text-sm font-medium text-foreground">Start as an application</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                {asApplication
                                    ? "Details, papers, payout account and terms first; the desk activates them with a grade."
                                    : "Active at once with no grade — only for someone whose papers ADX already holds."}
                            </span>
                        </span>
                        <Switch id="agent-as-application" checked={asApplication} onCheckedChange={setAsApplication} data-testid="agent-as-application" />
                    </label>

                    {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={() => handleOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={!live || !ready || busy}>
                            {busy ? "Adding…" : asApplication ? "Start the application" : "Add agent"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({
    id,
    label,
    hint,
    optional,
    errors,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    optional?: boolean;
    errors?: string[];
    children: React.ReactNode;
}) {
    const error = errors?.[0];
    return (
        <div className="grid content-start gap-1.5">
            <Label htmlFor={id}>
                {label}
                {optional && <span className="ml-1 font-normal text-muted-foreground">optional</span>}
            </Label>
            {children}
            {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}
