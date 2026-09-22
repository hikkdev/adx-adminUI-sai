"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CityCombobox } from "@/components/adx/city-combobox";
import { ApiError } from "@/lib/api-client";
import {
    AGENT_EDUCATION_LEVELS,
    AGENT_PLATFORMS,
    AGENT_VEHICLE_TYPES,
    EDUCATION_LABEL,
    PLATFORM_LABEL,
    VEHICLE_LABEL,
    agentApplicationService,
    type AgentEducationLevel,
    type AgentPlatform,
    type AgentVehicleType,
    type ApplicationProfilePatch,
    type ApplicationView,
} from "@/services/agent-applications";

interface EditApplicationDialogProps {
    view: ApplicationView;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: (next: ApplicationView) => void;
}

const GENDERS = [
    { value: "MALE", label: "Male" },
    { value: "FEMALE", label: "Female" },
    { value: "OTHER", label: "Other" },
    { value: "PREFER_NOT_TO_SAY", label: "Prefers not to say" },
] as const;

type Gender = (typeof GENDERS)[number]["value"];

interface Draft {
    name: string;
    dateOfBirth: string;
    gender: Gender | "";
    city: string;
    state: string;
    languages: string;
    vehicleType: AgentVehicleType | "";
    vehicleNumber: string;
    currentAddress: string;
    permanentAddress: string;
    emergencyContactName: string;
    emergencyContactRelation: string;
    emergencyContactPhone: string;
    highestEducation: AgentEducationLevel | "";
    salesExperienceYears: string;
    industries: string;
    noticePeriodDays: string;
    educations: { level: AgentEducationLevel; degree: string; institution: string; year: string }[];
    employments: { employer: string; role: string; industry: string; fromMonth: string; toMonth: string; current: boolean; reasonForLeaving: string }[];
    references: { name: string; relation: string; phone: string }[];
    platformExperiences: { platform: AgentPlatform; partnerId: string; years: string; active: boolean; ratingNote: string }[];
}

const list = (values: string[]) => values.join(", ");
const split = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);
const text = (value: string) => (value.trim() ? value.trim() : undefined);
const int = (value: string) => (value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined);

export function draftOf(view: ApplicationView): Draft {
    const p = view.profile;
    return {
        name: view.person.name ?? "",
        dateOfBirth: view.person.dateOfBirth ? view.person.dateOfBirth.slice(0, 10) : "",
        gender: (view.person.gender as Gender | null) ?? "",
        city: p.city ?? "",
        state: p.state ?? "",
        languages: list(p.languages ?? []),
        vehicleType: p.vehicleType ?? "",
        vehicleNumber: p.vehicleNumber ?? "",
        currentAddress: p.currentAddress ?? "",
        permanentAddress: p.permanentAddress ?? "",
        emergencyContactName: p.emergencyContactName ?? "",
        emergencyContactRelation: p.emergencyContactRelation ?? "",
        emergencyContactPhone: p.emergencyContactPhone ?? "",
        highestEducation: p.highestEducation ?? "",
        salesExperienceYears: p.salesExperienceYears === null ? "" : String(p.salesExperienceYears),
        industries: list(p.industries ?? []),
        noticePeriodDays: p.noticePeriodDays === null ? "" : String(p.noticePeriodDays),
        educations: view.educations.map((e) => ({ level: e.level, degree: e.degree ?? "", institution: e.institution ?? "", year: e.year === null ? "" : String(e.year) })),
        employments: view.employments.map((e) => ({ employer: e.employer, role: e.role ?? "", industry: e.industry ?? "", fromMonth: e.fromMonth ?? "", toMonth: e.toMonth ?? "", current: e.current, reasonForLeaving: e.reasonForLeaving ?? "" })),
        references: view.references.map((r) => ({ name: r.name, relation: r.relation ?? "", phone: r.phone })),
        platformExperiences: view.platformExperiences.map((x) => ({ platform: x.platform, partnerId: x.partnerId ?? "", years: x.years === null ? "" : String(x.years), active: x.active, ratingNote: x.ratingNote ?? "" })),
    };
}

/**
 * The draft as the desk door takes it. Blank text is left out (the schema
 * refuses empty strings); the clearable fields go as null when emptied;
 * the row arrays go whole for the side that has them.
 */
export function patchOf(d: Draft, side: ApplicationView["agent"]["side"]): ApplicationProfilePatch {
    const nullable = (value: string) => (value.trim() ? value.trim() : null);
    const common: ApplicationProfilePatch = {
        ...(text(d.name) ? { name: text(d.name) } : {}),
        ...(d.dateOfBirth ? { dateOfBirth: d.dateOfBirth } : {}),
        ...(d.gender ? { gender: d.gender } : {}),
        ...(text(d.city) ? { city: text(d.city) } : {}),
        ...(text(d.state) ? { state: text(d.state) } : {}),
        languages: split(d.languages),
        vehicleType: d.vehicleType || null,
        vehicleNumber: nullable(d.vehicleNumber),
        currentAddress: nullable(d.currentAddress),
        permanentAddress: nullable(d.permanentAddress),
        emergencyContactName: nullable(d.emergencyContactName),
        emergencyContactRelation: nullable(d.emergencyContactRelation),
        emergencyContactPhone: nullable(d.emergencyContactPhone),
    };
    if (side === "PUBLISHER") {
        return {
            ...common,
            platformExperiences: d.platformExperiences
                .filter((x) => x.platform)
                .map((x) => ({ platform: x.platform, ...(text(x.partnerId) ? { partnerId: text(x.partnerId) } : {}), ...(int(x.years) !== undefined ? { years: int(x.years) } : {}), active: x.active, ...(text(x.ratingNote) ? { ratingNote: text(x.ratingNote) } : {}) })),
        };
    }
    return {
        ...common,
        highestEducation: d.highestEducation || null,
        salesExperienceYears: int(d.salesExperienceYears) ?? null,
        industries: split(d.industries),
        noticePeriodDays: int(d.noticePeriodDays) ?? null,
        educations: d.educations.map((e) => ({ level: e.level, ...(text(e.degree) ? { degree: text(e.degree) } : {}), ...(text(e.institution) ? { institution: text(e.institution) } : {}), ...(int(e.year) !== undefined ? { year: int(e.year) } : {}) })),
        employments: d.employments
            .filter((e) => e.employer.trim())
            .map((e) => ({ employer: e.employer.trim(), ...(text(e.role) ? { role: text(e.role) } : {}), ...(text(e.industry) ? { industry: text(e.industry) } : {}), ...(e.fromMonth ? { fromMonth: e.fromMonth } : {}), ...(e.toMonth && !e.current ? { toMonth: e.toMonth } : {}), current: e.current, ...(text(e.reasonForLeaving) ? { reasonForLeaving: text(e.reasonForLeaving) } : {}) })),
        references: d.references.filter((r) => r.name.trim() && r.phone.trim()).map((r) => ({ name: r.name.trim(), ...(text(r.relation) ? { relation: text(r.relation) } : {}), phone: r.phone.trim() })),
    };
}

/**
 * The desk's copy of the app's "About you" step: the same fields, shaped by
 * the side. A field agent's form asks where they ride and which platforms
 * they have ridden for; a sales agent's asks for education, experience,
 * employers and references. Saved whole through the desk door; the ladder
 * says afterwards what is still missing.
 */
export function EditApplicationDialog({ view, open, onOpenChange, onSaved }: EditApplicationDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                {/* The form mounts with the content, so every opening starts from what is on the record. */}
                {open && (
                    <EditApplicationForm
                        view={view}
                        onCancel={() => onOpenChange(false)}
                        onSaved={(next) => {
                            onSaved(next);
                            onOpenChange(false);
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function EditApplicationForm({ view, onCancel, onSaved }: { view: ApplicationView; onCancel: () => void; onSaved: (next: ApplicationView) => void }) {
    const [d, setD] = React.useState<Draft>(() => draftOf(view));
    const [busy, setBusy] = React.useState(false);
    const [errors, setErrors] = React.useState<Record<string, string[]>>({});
    const [formError, setFormError] = React.useState<string | null>(null);
    const publisher = view.agent.side === "PUBLISHER";

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((cur) => ({ ...cur, [key]: value }));
    const field = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value as never);

    const save = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        setFormError(null);
        try {
            const next = await agentApplicationService.updateProfile(view.agent.id, patchOf(d, view.agent.side));
            const gaps = next.ladder.steps.find((s) => s.key === "PROFILE")?.missing ?? [];
            toast.success("Details saved", { description: gaps.length ? `Still needed: ${gaps.join(", ")}` : "The details step is done." });
            onSaved(next);
        } catch (cause) {
            if (cause instanceof ApiError) {
                setErrors(cause.fieldErrors);
                setFormError(cause.message);
            } else {
                setFormError(cause instanceof Error ? cause.message : "Could not save.");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
                <form onSubmit={save} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle>Edit details</DialogTitle>
                        <DialogDescription>
                            {publisher
                                ? "What the field app asks a rider — where they are, how they get around, who to call. The desk fills it in for someone at the counter."
                                : "What the app asks a sales applicant — education, experience, employers and references, the way a resume would say it."}
                        </DialogDescription>
                    </DialogHeader>

                    <Section title="The person">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field id="ap-name" label="Full name" errors={errors.name}>
                                <Input id="ap-name" value={d.name} onChange={field("name")} autoComplete="off" />
                            </Field>
                            <Field id="ap-dob" label={publisher ? "Date of birth (18+)" : "Date of birth (21+)"} errors={errors.dateOfBirth}>
                                <Input id="ap-dob" type="date" value={d.dateOfBirth} onChange={field("dateOfBirth")} />
                            </Field>
                            <Field id="ap-gender" label="Gender" errors={errors.gender}>
                                <Select value={d.gender || "unset"} onValueChange={(v) => set("gender", v === "unset" ? "" : (v as Gender))}>
                                    <SelectTrigger id="ap-gender" className="bg-card">
                                        <SelectValue placeholder="Not said" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unset">Not said</SelectItem>
                                        {GENDERS.map((g) => (
                                            <SelectItem key={g.value} value={g.value}>
                                                {g.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                    </Section>

                    <Section title="Where they are">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="ap-city" label="City" errors={errors.city}>
                                <CityCombobox id="ap-city" value={d.city} onChange={(city, picked) => setD((cur) => ({ ...cur, city, state: picked ? (picked.geoState?.name ?? picked.state ?? cur.state) : cur.state }))} stages={["LAUNCHED", "SEEDING"]} placeholder="Bengaluru" />
                            </Field>
                            <Field id="ap-state" label="State" errors={errors.state}>
                                <Input id="ap-state" value={d.state} onChange={field("state")} autoComplete="off" />
                            </Field>
                            <Field id="ap-current" label="Current address" errors={errors.currentAddress}>
                                <Input id="ap-current" value={d.currentAddress} onChange={field("currentAddress")} autoComplete="off" />
                            </Field>
                            <Field id="ap-permanent" label="Permanent address" errors={errors.permanentAddress}>
                                <Input id="ap-permanent" value={d.permanentAddress} onChange={field("permanentAddress")} autoComplete="off" />
                            </Field>
                            <Field id="ap-languages" label="Languages" errors={errors.languages}>
                                <Input id="ap-languages" value={d.languages} onChange={field("languages")} placeholder="Kannada, Hindi, English" autoComplete="off" />
                            </Field>
                        </div>
                    </Section>

                    <Section title="Getting around">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="ap-vehicle" label="Vehicle" errors={errors.vehicleType}>
                                <Select value={d.vehicleType || "unset"} onValueChange={(v) => set("vehicleType", v === "unset" ? "" : (v as AgentVehicleType))}>
                                    <SelectTrigger id="ap-vehicle" className="bg-card">
                                        <SelectValue placeholder="Not said" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unset">Not said</SelectItem>
                                        {AGENT_VEHICLE_TYPES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {VEHICLE_LABEL[v]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field id="ap-vehicle-no" label="Registration number" errors={errors.vehicleNumber}>
                                <Input id="ap-vehicle-no" value={d.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())} placeholder="KA01AB1234" autoComplete="off" />
                            </Field>
                        </div>
                        <p className="text-xs text-muted-foreground">A motor vehicle adds the licence, RC and insurance to the papers.</p>
                    </Section>

                    <Section title="Emergency contact">
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field id="ap-ec-name" label="Name" errors={errors.emergencyContactName}>
                                <Input id="ap-ec-name" value={d.emergencyContactName} onChange={field("emergencyContactName")} autoComplete="off" />
                            </Field>
                            <Field id="ap-ec-rel" label="Relation" errors={errors.emergencyContactRelation}>
                                <Input id="ap-ec-rel" value={d.emergencyContactRelation} onChange={field("emergencyContactRelation")} placeholder="Mother" autoComplete="off" />
                            </Field>
                            <Field id="ap-ec-phone" label="Phone" errors={errors.emergencyContactPhone}>
                                <Input id="ap-ec-phone" inputMode="tel" value={d.emergencyContactPhone} onChange={field("emergencyContactPhone")} autoComplete="off" />
                            </Field>
                        </div>
                    </Section>

                    {publisher ? (
                        <Section
                            title="Platforms they have ridden for"
                            action={
                                <AddRow onClick={() => set("platformExperiences", [...d.platformExperiences, { platform: "ZOMATO", partnerId: "", years: "", active: true, ratingNote: "" }])} disabled={d.platformExperiences.length >= 6} />
                            }
                        >
                            {d.platformExperiences.length === 0 && <p className="text-sm text-muted-foreground">None recorded. Zomato, Swiggy, Rapido and the like — it speaks for how they will do on the road.</p>}
                            {d.platformExperiences.map((row, i) => (
                                <div key={i} className="grid items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1fr_80px_auto_auto]">
                                    <Field id={`ap-pf-${i}`} label="Platform">
                                        <Select value={row.platform} onValueChange={(v) => set("platformExperiences", d.platformExperiences.map((r, j) => (j === i ? { ...r, platform: v as AgentPlatform } : r)))}>
                                            <SelectTrigger id={`ap-pf-${i}`} className="bg-card">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AGENT_PLATFORMS.map((p) => (
                                                    <SelectItem key={p} value={p}>
                                                        {PLATFORM_LABEL[p]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                    <Field id={`ap-pf-id-${i}`} label="Partner id">
                                        <Input id={`ap-pf-id-${i}`} value={row.partnerId} onChange={(e) => set("platformExperiences", d.platformExperiences.map((r, j) => (j === i ? { ...r, partnerId: e.target.value } : r)))} autoComplete="off" />
                                    </Field>
                                    <Field id={`ap-pf-years-${i}`} label="Years">
                                        <Input id={`ap-pf-years-${i}`} inputMode="decimal" value={row.years} onChange={(e) => set("platformExperiences", d.platformExperiences.map((r, j) => (j === i ? { ...r, years: e.target.value } : r)))} />
                                    </Field>
                                    <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
                                        <Checkbox checked={row.active} onCheckedChange={(c) => set("platformExperiences", d.platformExperiences.map((r, j) => (j === i ? { ...r, active: c === true } : r)))} />
                                        Still active
                                    </label>
                                    <RemoveRow onClick={() => set("platformExperiences", d.platformExperiences.filter((_, j) => j !== i))} />
                                </div>
                            ))}
                        </Section>
                    ) : (
                        <>
                            <Section title="Education and experience">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field id="ap-edu" label="Highest education (Class 12 or above)" errors={errors.highestEducation}>
                                        <Select value={d.highestEducation || "unset"} onValueChange={(v) => set("highestEducation", v === "unset" ? "" : (v as AgentEducationLevel))}>
                                            <SelectTrigger id="ap-edu" className="bg-card">
                                                <SelectValue placeholder="Not said" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="unset">Not said</SelectItem>
                                                {AGENT_EDUCATION_LEVELS.map((l) => (
                                                    <SelectItem key={l} value={l}>
                                                        {EDUCATION_LABEL[l]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                    <Field id="ap-sales-years" label="Years in sales" errors={errors.salesExperienceYears}>
                                        <Input id="ap-sales-years" inputMode="numeric" value={d.salesExperienceYears} onChange={field("salesExperienceYears")} />
                                    </Field>
                                    <Field id="ap-industries" label="Industries sold into" errors={errors.industries}>
                                        <Input id="ap-industries" value={d.industries} onChange={field("industries")} placeholder="Real estate, FMCG" autoComplete="off" />
                                    </Field>
                                    <Field id="ap-notice" label="Notice period (days)" errors={errors.noticePeriodDays}>
                                        <Input id="ap-notice" inputMode="numeric" value={d.noticePeriodDays} onChange={field("noticePeriodDays")} />
                                    </Field>
                                </div>
                            </Section>

                            <Section title="Qualifications" action={<AddRow onClick={() => set("educations", [...d.educations, { level: "GRADUATE", degree: "", institution: "", year: "" }])} disabled={d.educations.length >= 8} />}>
                                {d.educations.map((row, i) => (
                                    <div key={i} className="grid items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_80px_auto]">
                                        <Field id={`ap-ed-level-${i}`} label="Level">
                                            <Select value={row.level} onValueChange={(v) => set("educations", d.educations.map((r, j) => (j === i ? { ...r, level: v as AgentEducationLevel } : r)))}>
                                                <SelectTrigger id={`ap-ed-level-${i}`} className="bg-card">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {AGENT_EDUCATION_LEVELS.map((l) => (
                                                        <SelectItem key={l} value={l}>
                                                            {EDUCATION_LABEL[l]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                        <Field id={`ap-ed-degree-${i}`} label="Degree">
                                            <Input id={`ap-ed-degree-${i}`} value={row.degree} onChange={(e) => set("educations", d.educations.map((r, j) => (j === i ? { ...r, degree: e.target.value } : r)))} autoComplete="off" />
                                        </Field>
                                        <Field id={`ap-ed-inst-${i}`} label="Institution">
                                            <Input id={`ap-ed-inst-${i}`} value={row.institution} onChange={(e) => set("educations", d.educations.map((r, j) => (j === i ? { ...r, institution: e.target.value } : r)))} autoComplete="off" />
                                        </Field>
                                        <Field id={`ap-ed-year-${i}`} label="Year">
                                            <Input id={`ap-ed-year-${i}`} inputMode="numeric" value={row.year} onChange={(e) => set("educations", d.educations.map((r, j) => (j === i ? { ...r, year: e.target.value } : r)))} />
                                        </Field>
                                        <RemoveRow onClick={() => set("educations", d.educations.filter((_, j) => j !== i))} />
                                    </div>
                                ))}
                            </Section>

                            <Section title="Employers" action={<AddRow onClick={() => set("employments", [...d.employments, { employer: "", role: "", industry: "", fromMonth: "", toMonth: "", current: false, reasonForLeaving: "" }])} disabled={d.employments.length >= 10} />}>
                                {d.employments.map((row, i) => (
                                    <div key={i} className="grid gap-3 rounded-lg border bg-card p-3">
                                        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                                            <Field id={`ap-em-name-${i}`} label="Employer">
                                                <Input id={`ap-em-name-${i}`} value={row.employer} onChange={(e) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, employer: e.target.value } : r)))} autoComplete="off" />
                                            </Field>
                                            <Field id={`ap-em-role-${i}`} label="Role">
                                                <Input id={`ap-em-role-${i}`} value={row.role} onChange={(e) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, role: e.target.value } : r)))} autoComplete="off" />
                                            </Field>
                                            <Field id={`ap-em-ind-${i}`} label="Industry">
                                                <Input id={`ap-em-ind-${i}`} value={row.industry} onChange={(e) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, industry: e.target.value } : r)))} autoComplete="off" />
                                            </Field>
                                            <RemoveRow onClick={() => set("employments", d.employments.filter((_, j) => j !== i))} />
                                        </div>
                                        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_1fr]">
                                            <Field id={`ap-em-from-${i}`} label="From">
                                                <Input id={`ap-em-from-${i}`} type="month" value={row.fromMonth} onChange={(e) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, fromMonth: e.target.value } : r)))} />
                                            </Field>
                                            <Field id={`ap-em-to-${i}`} label="To">
                                                <Input id={`ap-em-to-${i}`} type="month" value={row.toMonth} disabled={row.current} onChange={(e) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, toMonth: e.target.value } : r)))} />
                                            </Field>
                                            <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
                                                <Checkbox checked={row.current} onCheckedChange={(c) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, current: c === true } : r)))} />
                                                Current
                                            </label>
                                            <Field id={`ap-em-why-${i}`} label="Reason for leaving">
                                                <Input id={`ap-em-why-${i}`} value={row.reasonForLeaving} onChange={(e) => set("employments", d.employments.map((r, j) => (j === i ? { ...r, reasonForLeaving: e.target.value } : r)))} autoComplete="off" />
                                            </Field>
                                        </div>
                                    </div>
                                ))}
                            </Section>

                            <Section title="References" action={<AddRow onClick={() => set("references", [...d.references, { name: "", relation: "", phone: "" }])} disabled={d.references.length >= 4} />}>
                                {d.references.length === 0 && <p className="text-sm text-muted-foreground">Two references are needed before the application can be submitted.</p>}
                                {d.references.map((row, i) => (
                                    <div key={i} className="grid items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                                        <Field id={`ap-ref-name-${i}`} label="Name">
                                            <Input id={`ap-ref-name-${i}`} value={row.name} onChange={(e) => set("references", d.references.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} autoComplete="off" />
                                        </Field>
                                        <Field id={`ap-ref-rel-${i}`} label="Relation">
                                            <Input id={`ap-ref-rel-${i}`} value={row.relation} onChange={(e) => set("references", d.references.map((r, j) => (j === i ? { ...r, relation: e.target.value } : r)))} placeholder="Former manager" autoComplete="off" />
                                        </Field>
                                        <Field id={`ap-ref-phone-${i}`} label="Phone">
                                            <Input id={`ap-ref-phone-${i}`} inputMode="tel" value={row.phone} onChange={(e) => set("references", d.references.map((r, j) => (j === i ? { ...r, phone: e.target.value } : r)))} autoComplete="off" />
                                        </Field>
                                        <RemoveRow onClick={() => set("references", d.references.filter((_, j) => j !== i))} />
                                    </div>
                                ))}
                            </Section>
                        </>
                    )}

                    {formError && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}

                    <DialogFooter>
                        <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={busy}>
                            {busy ? "Saving…" : "Save details"}
                        </Button>
                    </DialogFooter>
                </form>
    );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">{title}</h4>
                {action}
            </div>
            {children}
        </section>
    );
}

function AddRow({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
    return (
        <Button type="button" variant="outline" size="sm" className="h-7 bg-card px-2 text-xs" onClick={onClick} disabled={disabled}>
            <Plus className="size-3" aria-hidden />
            Add
        </Button>
    );
}

function RemoveRow({ onClick }: { onClick: () => void }) {
    return (
        <Button type="button" variant="ghost" size="icon" className="size-8 self-end" aria-label="Remove" onClick={onClick}>
            <Trash2 className="size-3.5" aria-hidden />
        </Button>
    );
}

function Field({ id, label, hint, errors, children }: { id: string; label: string; hint?: string; errors?: string[]; children: React.ReactNode }) {
    const error = errors?.[0];
    return (
        <div className="grid content-start gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
            {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}
