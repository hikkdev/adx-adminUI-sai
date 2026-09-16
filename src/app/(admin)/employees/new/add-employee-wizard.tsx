"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { apiConfig } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import type { DepartmentView } from "@/services/departments";
import {
    EMPLOYMENT_TYPES,
    EMPLOYMENT_TYPE_META,
    WORK_MODES,
    WORK_MODE_META,
    employeesService,
    type CreateEmployeeInput,
    type EmploymentType,
    type InviteMethod,
    type WorkMode,
} from "@/services/employees";
import type { RoleConfig } from "@/services/roles";
import { USER_STATUS_META, type UserRow } from "@/services/users";
import { USER_ROLE_META } from "@/types";

interface AddEmployeeWizardProps {
    departments: DepartmentView[];
    roles: RoleConfig[];
}

const STEPS = ["Person", "Professional", "Console access", "Review"];

/** The pickers' values for "no role", "no department", "not set". */
const NO_ROLE = "__none__";
const NO_DEPARTMENT = "__none__";
const UNSET = "__unset__";

/**
 * The DR 10 frame `Add Employee · /employees/new`.
 *
 * The frame's stepper, card and Back / Continue row are kept. The steps are
 * not the frame's six: an HR record hangs off a `User` that already exists
 * (`POST /employees` is 404 against an unknown one), so the first step
 * finds the account rather than typing a name; the Documents step went to
 * the HR tool with the documents themselves (Q98), and the Payroll step
 * had no column to write to. What is left is what the route takes — the
 * user, a department record and designation, and Lot A's optional console
 * invitation with its role picker — and a review. Lot G (Q122/Q140): the
 * department is a record picked by id, and the Professional step also
 * takes the region, the work mode and the employment type, which are
 * columns on `Employee` now.
 */
export function AddEmployeeWizard({ departments, roles }: AddEmployeeWizardProps) {
    const router = useRouter();
    const [step, setStep] = React.useState(0);
    const [query, setQuery] = React.useState("");
    const settledQuery = useDebounced(query.trim());
    const [user, setUser] = React.useState<UserRow | null>(null);
    const [form, setForm] = React.useState({
        departmentId: NO_DEPARTMENT,
        designation: "",
        region: "",
        workMode: UNSET as WorkMode | typeof UNSET,
        employmentType: UNSET as EmploymentType | typeof UNSET,
        invite: false,
        roleId: NO_ROLE,
        method: "PASSWORD" as InviteMethod,
    });
    const [submitting, setSubmitting] = React.useState(false);

    const matches = useApiResource<UserRow[]>(`employees:new:users:${settledQuery}`, () =>
        settledQuery.length >= 2 ? employeesService.searchUsers(settledQuery) : Promise.resolve([]),
    );

    const patch = (partial: Partial<typeof form>) => setForm((current) => ({ ...current, ...partial }));

    const department = departments.find((candidate) => candidate.id === form.departmentId) ?? null;
    const designation = form.designation.trim();
    const region = form.region.trim();

    const stepProblem = (): string | null => {
        if (step === 0 && !user) return "Pick the account the record hangs off.";
        if (step === 1 && !designation) return "Add the designation for this role.";
        if (step === 2 && form.invite && !user?.email) return "This account has no email, so it cannot be invited. Turn the invitation off or add an email under Users.";
        return null;
    };

    const next = () => {
        const problem = stepProblem();
        if (problem) {
            toast.error(problem);
            return;
        }
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
    };

    const submit = async () => {
        if (!user) return;
        const input: CreateEmployeeInput = {
            userId: user.id,
            ...(department ? { departmentId: department.id } : {}),
            ...(designation ? { designation } : {}),
            ...(region ? { region } : {}),
            ...(form.workMode !== UNSET ? { workMode: form.workMode } : {}),
            ...(form.employmentType !== UNSET ? { employmentType: form.employmentType } : {}),
            ...(form.invite
                ? { inviteToConsole: { method: form.method, ...(form.roleId !== NO_ROLE ? { roleConfigId: form.roleId } : {}) } }
                : {}),
        };
        setSubmitting(true);
        try {
            const created = await employeesService.create(input);
            toast.success(`${user.displayName} added${created.displayId ? ` as ${created.displayId}` : ""}`, {
                description: created.invite
                    ? `Console invitation sent to ${created.invite.email}; the link lasts a week.`
                    : "HR record opened.",
            });
            router.push(`/employees/directory/${user.id}`);
        } catch (caught) {
            toast.error(caught instanceof ApiError ? caught.message : "Could not create the record.");
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <ol className="flex items-center gap-2">
                {STEPS.map((label, index) => (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                            className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                index < step
                                    ? "bg-success text-white"
                                    : index === step
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground",
                            )}
                        >
                            {index < step ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span
                            className={cn(
                                "hidden text-sm sm:inline",
                                index === step ? "font-medium text-foreground" : "text-muted-foreground",
                            )}
                        >
                            {label}
                        </span>
                        {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
                    </li>
                ))}
            </ol>

            <Card className="rounded-lg border-border p-5 shadow-none">
                {step === 0 && (
                    <div className="space-y-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-user">Find the account</Label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="emp-user"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Name, email or mobile"
                                    className="pl-9"
                                    autoComplete="off"
                                    autoFocus
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                An HR record hangs off a user account. No account yet? Invite one under{" "}
                                <Link href="/users/accounts" className="font-medium text-primary hover:underline">
                                    Users
                                </Link>{" "}
                                or approve their intake under{" "}
                                <Link href="/onboarding/submissions?userType=EMPLOYEE" className="font-medium text-primary hover:underline">
                                    Onboarding
                                </Link>
                                .
                            </p>
                        </div>
                        {user && (
                            <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                                <InitialsAvatar name={user.displayName} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">{user.displayName}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {[user.email, user.mobile].filter(Boolean).join(" · ")}
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" className="bg-card" onClick={() => setUser(null)}>
                                    Change
                                </Button>
                            </div>
                        )}
                        {!user && settledQuery.length >= 2 && (
                            <ul className="divide-y rounded-lg border">
                                {matches.loading && matches.data === null ? (
                                    <li className="px-3 py-3 text-sm text-muted-foreground">Searching…</li>
                                ) : matches.error ? (
                                    <li className="px-3 py-3 text-sm text-danger">{matches.error}</li>
                                ) : (matches.data ?? []).length === 0 ? (
                                    <li className="px-3 py-3 text-sm text-muted-foreground">No account matches "{settledQuery}".</li>
                                ) : (
                                    (matches.data ?? []).slice(0, 8).map((row) => (
                                        <li key={row.id}>
                                            <button
                                                type="button"
                                                onClick={() => setUser(row)}
                                                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                                            >
                                                <InitialsAvatar name={row.displayName} size="sm" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-foreground">{row.displayName}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {[row.email, row.mobile].filter(Boolean).join(" · ")}
                                                    </span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1">
                                                    {row.roles.slice(0, 2).map((role) => (
                                                        <span key={role} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                            {USER_ROLE_META[role]?.label ?? role}
                                                        </span>
                                                    ))}
                                                    <StatusBadge status={USER_STATUS_META[row.status]} />
                                                </span>
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>
                        )}
                    </div>
                )}

                {step === 1 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-department">Department</Label>
                            <Select value={form.departmentId} onValueChange={(value) => patch({ departmentId: value })}>
                                <SelectTrigger id="emp-department">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_DEPARTMENT}>No department yet</SelectItem>
                                    {departments.map((candidate) => (
                                        <SelectItem key={candidate.id} value={candidate.id}>
                                            {candidate.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                A department not listed is added under{" "}
                                <Link href="/employees/departments" className="font-medium text-primary hover:underline">
                                    Departments
                                </Link>
                                .
                            </p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-designation">Designation</Label>
                            <Input
                                id="emp-designation"
                                value={form.designation}
                                onChange={(event) => patch({ designation: event.target.value })}
                                placeholder="e.g. Ops Executive"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-region">Region</Label>
                            <Input id="emp-region" value={form.region} onChange={(event) => patch({ region: event.target.value })} placeholder="e.g. Delhi NCR" maxLength={80} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-work-mode">Work mode</Label>
                            <Select value={form.workMode} onValueChange={(value) => patch({ workMode: value as WorkMode | typeof UNSET })}>
                                <SelectTrigger id="emp-work-mode">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={UNSET}>Not set</SelectItem>
                                    {WORK_MODES.map((mode) => (
                                        <SelectItem key={mode} value={mode}>
                                            {WORK_MODE_META[mode].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-employment-type">Employment type</Label>
                            <Select value={form.employmentType} onValueChange={(value) => patch({ employmentType: value as EmploymentType | typeof UNSET })}>
                                <SelectTrigger id="emp-employment-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={UNSET}>Not set</SelectItem>
                                    {EMPLOYMENT_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {EMPLOYMENT_TYPE_META[type].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="self-end text-xs text-muted-foreground sm:col-span-2">
                            Joining date and pay are recorded in the HR tool, not here.
                        </p>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <label className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                            <span>
                                <span className="block text-sm font-medium text-foreground">Invite to the console</span>
                                <span className="block text-xs text-muted-foreground">
                                    {user?.email
                                        ? `A one-week link goes to ${user.email} once the record exists.`
                                        : "This account has no email on file, so there is nowhere to send an invitation."}
                                </span>
                            </span>
                            <Switch checked={form.invite} onCheckedChange={(checked) => patch({ invite: checked })} disabled={!user?.email} aria-label="Invite to the console" />
                        </label>
                        {form.invite && (
                            <>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="emp-role">Console role</Label>
                                    <Select value={form.roleId} onValueChange={(value) => patch({ roleId: value })}>
                                        <SelectTrigger id="emp-role">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NO_ROLE}>Super admin (no role — every permission)</SelectItem>
                                            {roles.map((role) => (
                                                <SelectItem key={role.id} value={role.id}>
                                                    {role.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <fieldset className="grid gap-2">
                                    <legend className="text-sm font-medium text-foreground">How they will sign in</legend>
                                    <RadioGroup value={form.method} onValueChange={(value) => patch({ method: value as InviteMethod })}>
                                        <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5">
                                            <RadioGroupItem value="PASSWORD" className="mt-0.5" />
                                            <span>
                                                <span className="block text-sm font-medium text-foreground">Password</span>
                                                <span className="block text-xs text-muted-foreground">They choose one as they accept.</span>
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-2.5 rounded-md border px-3 py-2.5">
                                            <RadioGroupItem value="GOOGLE" className="mt-0.5" />
                                            <span>
                                                <span className="block text-sm font-medium text-foreground">Google Workspace</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {apiConfig.googleClientId
                                                        ? "They sign in with the Workspace account at this address."
                                                        : "The console has no Google client ID configured, so this sign-in will not be offered on the accept screen until it does."}
                                                </span>
                                            </span>
                                        </label>
                                    </RadioGroup>
                                </fieldset>
                            </>
                        )}
                    </div>
                )}

                {step === 3 && user && (
                    <FieldList
                        items={[
                            ["Account", `${user.displayName}${user.email ? ` · ${user.email}` : ""}`],
                            ["Mobile", user.mobile],
                            ["Department", department?.name ?? "—"],
                            ["Designation", designation || "—"],
                            ["Region", region || "—"],
                            ["Work mode", form.workMode === UNSET ? "—" : WORK_MODE_META[form.workMode].label],
                            ["Employment type", form.employmentType === UNSET ? "—" : EMPLOYMENT_TYPE_META[form.employmentType].label],
                            [
                                "Console access",
                                form.invite
                                    ? `Invitation to ${user.email} · ${form.roleId === NO_ROLE ? "Super admin" : (roles.find((role) => role.id === form.roleId)?.name ?? form.roleId)} · ${form.method === "GOOGLE" ? "Google Workspace" : "password"}`
                                    : "No invitation",
                            ],
                            ["Employee ID", "Minted on create (EMP-…)"],
                        ]}
                    />
                )}
            </Card>

            <div className="flex items-center justify-between">
                <Button variant="outline" className="bg-card" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || submitting}>
                    <ChevronLeft className="size-4" />
                    Back
                </Button>
                {step < STEPS.length - 1 ? (
                    <Button onClick={next}>
                        Continue
                        <ChevronRight className="size-4" />
                    </Button>
                ) : (
                    <Button onClick={() => void submit()} disabled={submitting}>
                        {submitting ? "Creating…" : "Create record"}
                    </Button>
                )}
            </div>
        </div>
    );
}
