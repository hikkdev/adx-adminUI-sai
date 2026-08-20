"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FieldList } from "@/components/adx/simple-table";
import { cn } from "@/lib/utils";

interface AddEmployeeWizardProps {
    departments: string[];
}

const STEPS = ["Personal", "Professional", "Documents & BGV", "Payroll", "Account", "Review"];

const DOCUMENT_SLOTS = [
    "Aadhaar card",
    "PAN card",
    "Appointment letter",
    "Salary slips",
    "Relieving letter",
    "Experience letter",
    "BGV report",
];

const BGV_STATUSES = ["Not started", "In progress", "Clear", "Discrepancy found"];

export function AddEmployeeWizard({ departments }: AddEmployeeWizardProps) {
    const router = useRouter();
    const [step, setStep] = React.useState(0);
    const [uploaded, setUploaded] = React.useState<string[]>([]);
    const [form, setForm] = React.useState({
        firstName: "",
        lastName: "",
        mobile: "",
        email: "",
        dob: "",
        gender: "Female",
        maritalStatus: "Single",
        address: "",
        department: departments[0] ?? "Design",
        designation: "",
        type: "office",
        employment: "permanent",
        joiningDate: "2026-08-17",
        location: "Main Office",
        region: "Maharashtra",
        officialEmail: "",
        slackId: "",
        githubId: "",
        aadhaar: "",
        bgvStatus: "Not started",
        bgvAgency: "",
        bgvNotes: "",
        monthlyCtc: "",
        bankAccount: "",
        ifsc: "",
        pan: "",
        uan: "",
    });

    const patch = (partial: Partial<typeof form>) =>
        setForm((current) => ({ ...current, ...partial }));

    const stepValid = () => {
        if (step === 0)
            return (
                form.firstName.trim().length > 1 &&
                form.lastName.trim().length > 0 &&
                form.mobile.trim().length >= 10
            );
        if (step === 1) return form.designation.trim().length > 1;
        if (step === 2)
            return form.aadhaar.trim() === "" || /^\d{12}$/.test(form.aadhaar.trim());
        if (step === 3)
            return (
                Number(form.monthlyCtc) > 0 &&
                form.bankAccount.trim().length >= 9 &&
                form.ifsc.trim().length === 11
            );
        return true;
    };

    const next = () => {
        if (!stepValid()) {
            toast.error(
                step === 0
                    ? "Name and a valid mobile number are needed."
                    : step === 1
                      ? "Add the designation for this role."
                      : step === 2
                        ? "Aadhaar must be exactly 12 digits."
                        : "Monthly CTC, a bank account and an 11 character IFSC are needed."
            );
            return;
        }
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
    };

    const submit = () => {
        toast.success(`${form.firstName} ${form.lastName} added`, {
            description: "Profile created and onboarding email sent.",
        });
        router.push("/employees/directory");
    };

    const toggleUpload = (slot: string) =>
        setUploaded((current) =>
            current.includes(slot)
                ? current.filter((item) => item !== slot)
                : [...current, slot]
        );

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
                                      : "bg-muted text-muted-foreground"
                            )}
                        >
                            {index < step ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span
                            className={cn(
                                "hidden text-sm sm:inline",
                                index === step
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground"
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
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-first">First name</Label>
                            <Input
                                id="emp-first"
                                value={form.firstName}
                                onChange={(event) => patch({ firstName: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-last">Last name</Label>
                            <Input
                                id="emp-last"
                                value={form.lastName}
                                onChange={(event) => patch({ lastName: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-mobile">Mobile</Label>
                            <Input
                                id="emp-mobile"
                                value={form.mobile}
                                onChange={(event) => patch({ mobile: event.target.value })}
                                placeholder="10 digit number"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-email">Personal email</Label>
                            <Input
                                id="emp-email"
                                type="email"
                                value={form.email}
                                onChange={(event) => patch({ email: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-dob">Date of birth</Label>
                            <Input
                                id="emp-dob"
                                type="date"
                                value={form.dob}
                                onChange={(event) => patch({ dob: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-gender">Gender</Label>
                            <Select
                                value={form.gender}
                                onValueChange={(value) => patch({ gender: value })}
                            >
                                <SelectTrigger id="emp-gender">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Female">Female</SelectItem>
                                    <SelectItem value="Male">Male</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5 sm:col-span-2">
                            <Label htmlFor="emp-address">Address</Label>
                            <Input
                                id="emp-address"
                                value={form.address}
                                onChange={(event) => patch({ address: event.target.value })}
                                placeholder="Street, city"
                            />
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-department">Department</Label>
                            <Select
                                value={form.department}
                                onValueChange={(value) => patch({ department: value })}
                            >
                                <SelectTrigger id="emp-department">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map((department) => (
                                        <SelectItem key={department} value={department}>
                                            {department}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                            <Label htmlFor="emp-type">Work mode</Label>
                            <Select
                                value={form.type}
                                onValueChange={(value) => patch({ type: value })}
                            >
                                <SelectTrigger id="emp-type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="office">Office</SelectItem>
                                    <SelectItem value="remote">Remote</SelectItem>
                                    <SelectItem value="field">Field</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-employment">Employment</Label>
                            <Select
                                value={form.employment}
                                onValueChange={(value) => patch({ employment: value })}
                            >
                                <SelectTrigger id="emp-employment">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="permanent">Permanent</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="part_time">Part time</SelectItem>
                                    <SelectItem value="probation">Probation</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-joining">Joining date</Label>
                            <Input
                                id="emp-joining"
                                type="date"
                                value={form.joiningDate}
                                onChange={(event) => patch({ joiningDate: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-region">Region</Label>
                            <Input
                                id="emp-region"
                                value={form.region}
                                onChange={(event) => patch({ region: event.target.value })}
                            />
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {DOCUMENT_SLOTS.map((slot) => {
                            const done = uploaded.includes(slot);
                            return (
                                <button
                                    key={slot}
                                    type="button"
                                    onClick={() => toggleUpload(slot)}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                                        done
                                            ? "border-success/40 bg-success-soft"
                                            : "bg-card hover:border-primary/40"
                                    )}
                                >
                                    {done ? (
                                        <Check className="size-5 text-success" />
                                    ) : (
                                        <Upload className="size-5 text-muted-foreground" />
                                    )}
                                    <span className="text-sm font-medium text-foreground">{slot}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {done ? "Attached" : "PDF or image up to 5 MB"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {step === 2 && (
                    <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-aadhaar">Aadhaar number</Label>
                            <Input
                                id="emp-aadhaar"
                                inputMode="numeric"
                                maxLength={12}
                                value={form.aadhaar}
                                onChange={(event) =>
                                    patch({ aadhaar: event.target.value.replace(/\D/g, "") })
                                }
                                placeholder="12 digits"
                                className="tabular-nums"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-bgv-status">BGV status</Label>
                            <Select
                                value={form.bgvStatus}
                                onValueChange={(value) => patch({ bgvStatus: value })}
                            >
                                <SelectTrigger id="emp-bgv-status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BGV_STATUSES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-bgv-agency">BGV agency</Label>
                            <Input
                                id="emp-bgv-agency"
                                value={form.bgvAgency}
                                onChange={(event) => patch({ bgvAgency: event.target.value })}
                                placeholder="e.g. AuthBridge"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-bgv-notes">BGV notes</Label>
                            <Input
                                id="emp-bgv-notes"
                                value={form.bgvNotes}
                                onChange={(event) => patch({ bgvNotes: event.target.value })}
                                placeholder="Findings, reference numbers"
                            />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-ctc">Monthly CTC (₹)</Label>
                            <Input
                                id="emp-ctc"
                                type="number"
                                min="0"
                                step="1000"
                                value={form.monthlyCtc}
                                onChange={(event) => patch({ monthlyCtc: event.target.value })}
                                className="tabular-nums"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-pan">PAN</Label>
                            <Input
                                id="emp-pan"
                                maxLength={10}
                                value={form.pan}
                                onChange={(event) => patch({ pan: event.target.value.toUpperCase() })}
                                placeholder="ABCDE1234F"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-bank">Bank account number</Label>
                            <Input
                                id="emp-bank"
                                inputMode="numeric"
                                value={form.bankAccount}
                                onChange={(event) =>
                                    patch({ bankAccount: event.target.value.replace(/\D/g, "") })
                                }
                                className="tabular-nums"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-ifsc">IFSC</Label>
                            <Input
                                id="emp-ifsc"
                                maxLength={11}
                                value={form.ifsc}
                                onChange={(event) => patch({ ifsc: event.target.value.toUpperCase() })}
                                placeholder="HDFC0001234"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-uan">PF UAN (optional)</Label>
                            <Input
                                id="emp-uan"
                                inputMode="numeric"
                                maxLength={12}
                                value={form.uan}
                                onChange={(event) =>
                                    patch({ uan: event.target.value.replace(/\D/g, "") })
                                }
                                className="tabular-nums"
                            />
                        </div>
                        <p className="self-end text-xs text-muted-foreground sm:col-span-2">
                            Payroll starts on the first full month after joining. It can be paused
                            any time from the Payroll register.
                        </p>
                    </div>
                )}

                {step === 4 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-official">Official email</Label>
                            <Input
                                id="emp-official"
                                value={form.officialEmail}
                                onChange={(event) => patch({ officialEmail: event.target.value })}
                                placeholder="name@adx.in"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-slack">Slack handle</Label>
                            <Input
                                id="emp-slack"
                                value={form.slackId}
                                onChange={(event) => patch({ slackId: event.target.value })}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="emp-github">GitHub username</Label>
                            <Input
                                id="emp-github"
                                value={form.githubId}
                                onChange={(event) => patch({ githubId: event.target.value })}
                            />
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <FieldList
                        items={[
                            ["Name", `${form.firstName} ${form.lastName}`.trim() || "Not set"],
                            ["Mobile", form.mobile || "Not set"],
                            ["Personal email", form.email || "Not set"],
                            ["Department", form.department],
                            ["Designation", form.designation || "Not set"],
                            [
                                "Work mode",
                                form.type[0].toUpperCase() + form.type.slice(1),
                            ],
                            ["Employment", form.employment.replace("_", " ")],
                            ["Joining", form.joiningDate],
                            ["Region", form.region],
                            [
                                "Documents",
                                uploaded.length
                                    ? `${uploaded.length} of ${DOCUMENT_SLOTS.length} attached`
                                    : "None attached yet",
                            ],
                            ["Official email", form.officialEmail || "Will be provisioned"],
                            [
                                "Aadhaar",
                                form.aadhaar ? `•••• •••• ${form.aadhaar.slice(-4)}` : "Not captured",
                            ],
                            ["BGV", form.bgvStatus],
                            [
                                "Monthly CTC",
                                form.monthlyCtc
                                    ? `₹${Number(form.monthlyCtc).toLocaleString("en-IN")}`
                                    : "Not set",
                            ],
                            [
                                "Salary account",
                                form.bankAccount
                                    ? `••••${form.bankAccount.slice(-4)} · ${form.ifsc}`
                                    : "Not set",
                            ],
                        ]}
                    />
                )}
            </Card>

            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    className="bg-card"
                    disabled={step === 0}
                    onClick={() => setStep((current) => Math.max(current - 1, 0))}
                >
                    <ChevronLeft className="size-4" />
                    Back
                </Button>
                {step < STEPS.length - 1 ? (
                    <Button onClick={next}>
                        Continue
                        <ChevronRight className="size-4" />
                    </Button>
                ) : (
                    <Button onClick={submit}>Add employee</Button>
                )}
            </div>
        </div>
    );
}
