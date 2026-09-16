"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isLive } from "@/lib/api-config";
import { ExternalLink, FileText, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DetailShell } from "@/components/adx/detail-shell";
import { openPrivateFile } from "@/components/adx/private-file";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { EMPLOYEE_KYC_STATUS_META, employeeKycService, type EmployeeKycCase } from "@/services/employee-kyc";
import { requestOf } from "@/services/kyc";
import { KYC_STATE_META } from "@/services/kyc-state";
import { KycRowActions } from "@/app/(admin)/kyc/_shared/kyc-row-actions";
import { AssignedTasksCard } from "@/app/(admin)/tasks/assigned-tasks-card";
import {
    EMPLOYEE_STATUS_META,
    EMPLOYMENT_TYPE_META,
    WORK_MODE_META,
    employeesService,
    type EmployeeDetail,
    type EmployeeDocumentRow,
} from "@/services/employees";
import { EditEmployeeDialog } from "./edit-employee-dialog";

interface EmployeeProfileProps {
    employee: EmployeeDetail;
    kyc: EmployeeKycCase | null;
    onChanged: () => void;
}

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

/**
 * The DR 10 frame `Employee Profile · /employees/directory/emp_01`.
 *
 * The frame's back link, heading (name, "designation · department", badges
 * on the right), four tiles and four tabs are kept. What filled them is
 * not: the joining date, region, working week, date of birth, address and
 * connected accounts have no column on `Employee` (Q98: they are the HR
 * tool's), so the tiles say what the record does say — the EMP id, when
 * it was opened, the console account it hangs off, and where the person's
 * KYC stands — and the tabs draw the contact slice, the professional
 * fields, the eighteen document slots and the two doors out.
 *
 * The documents are "on file" or "missing" for everybody; opening one is
 * privileged (`hr.documents.view`), and the URL is only there when the
 * server chose to send it.
 */
export function EmployeeProfile({ employee, kyc, onChanged }: EmployeeProfileProps) {
    const router = useRouter();
    const { can } = useAuth();
    const mayOpen = can("hr.documents.view") && !employee.documentsMasked;
    const [editing, setEditing] = React.useState(false);
    const [removing, setRemoving] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const onFile = employee.documents.filter((row) => row.onFile).length;
    const kycStatus = kyc ? EMPLOYEE_KYC_STATUS_META[kyc.status] : null;

    const remove = async () => {
        setBusy(true);
        try {
            await employeesService.remove(employee.userId);
            toast.success(`${employee.name}'s HR record removed`, { description: "The console account is unchanged." });
            router.push("/employees/directory");
        } catch (caught) {
            toast.error(message(caught, "Could not remove the record."));
            setBusy(false);
        }
    };

    const open = async (row: EmployeeDocumentRow, url: string) => {
        try {
            await openPrivateFile(url);
        } catch (caught) {
            toast.error(message(caught, `Could not open ${row.label}.`));
        }
    };

    return (
        <>
            <DetailShell
                backHref="/employees/directory"
                backLabel="Directory"
                title={employee.name}
                subtitle={[employee.designation, employee.department].filter(Boolean).join(" · ") || "No designation on record"}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={EMPLOYEE_STATUS_META[employee.status]} />
                        {kycStatus && <StatusBadge status={kycStatus} />}
                        {employee.hrmsLink && (
                            <Button variant="outline" className="bg-card" asChild>
                                <a href={employee.hrmsLink} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="size-4" />
                                    Open in HR tool
                                </a>
                            </Button>
                        )}
                        <Button variant="outline" className="bg-card" onClick={() => setEditing(true)} disabled={busy}>
                            <Pencil className="size-4" />
                            Edit
                        </Button>
                    </div>
                }
                kpis={[
                    {
                        id: "code",
                        label: "Employee ID",
                        value: employee.displayId ?? "—",
                        hint: employee.externalHrmsId ? `HR tool: ${employee.externalHrmsId}` : "not linked to the HR tool",
                    },
                    {
                        id: "since",
                        label: "On record since",
                        value: formatDate(employee.createdAt),
                        hint: "when the HR record was opened",
                    },
                    {
                        id: "account",
                        label: "Console account",
                        value: employee.email ?? employee.mobile ?? "—",
                        hint: "the user this record hangs off",
                    },
                    {
                        id: "kyc",
                        label: "Employee KYC",
                        value: kycStatus?.label ?? "Not recorded",
                        hint: kyc ? `${kyc.documents} of 7 documents recorded` : "nothing recorded at the desk yet",
                    },
                ]}
                tabs={[
                    {
                        value: "personal",
                        label: "Personal",
                        content: (
                            <div className="grid gap-4 xl:grid-cols-2">
                                <SectionCard title="Contact" description="The slice of the user record every employee read joins">
                                    <FieldList
                                        items={[
                                            ["Full name", employee.name],
                                            ["Mobile", employee.mobile ?? "—"],
                                            ["Email", employee.email ?? "—"],
                                        ]}
                                    />
                                </SectionCard>
                                <SectionCard title="Everything else" description="Date of birth, address, next of kin — the HR tool's">
                                    {employee.hrmsLink ? (
                                        <Button variant="outline" className="bg-card" asChild>
                                            <a href={employee.hrmsLink} target="_blank" rel="noopener noreferrer">
                                                <ExternalLink className="size-4" />
                                                Open {employee.name} in the HR tool
                                            </a>
                                        </Button>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            {employee.externalHrmsId
                                                ? "The HR tool has no portal or link template set — add them under Settings › Integrations."
                                                : "This record has no HR-tool id yet. Add it with Edit to link the profile through."}
                                        </p>
                                    )}
                                </SectionCard>
                            </div>
                        ),
                    },
                    {
                        value: "professional",
                        label: "Professional",
                        content: (
                            <SectionCard title="Professional information">
                                <FieldList
                                    items={[
                                        ["Employee ID", employee.displayId ?? "—"],
                                        [
                                            "Department",
                                            employee.departmentId ? (
                                                <Link key="department" href={`/employees/departments/${encodeURIComponent(employee.departmentId)}`} className="hover:underline">
                                                    {employee.department ?? "—"}
                                                </Link>
                                            ) : (
                                                (employee.department ?? "—")
                                            ),
                                        ],
                                        ["Designation", employee.designation ?? "—"],
                                        ["Region", employee.region ?? "—"],
                                        ["Work mode", employee.workMode ? <StatusBadge key="work-mode" status={WORK_MODE_META[employee.workMode]} /> : "—"],
                                        ["Employment type", employee.employmentType ? <StatusBadge key="employment" status={EMPLOYMENT_TYPE_META[employee.employmentType]} /> : "—"],
                                        ["Status", <StatusBadge key="status" status={EMPLOYEE_STATUS_META[employee.status]} />],
                                        ["HR-tool id", employee.externalHrmsId ?? "—"],
                                        ["On record since", formatDate(employee.createdAt)],
                                    ]}
                                />
                            </SectionCard>
                        ),
                    },
                    {
                        value: "documents",
                        label: "Documents",
                        content: (
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    {onFile} of {employee.documents.length} on file.{" "}
                                    {employee.documentsMasked
                                        ? "Opening a document needs the hr.documents.view permission; presence is shown for everybody."
                                        : "New documents go to the HR tool; what was uploaded here stays."}
                                </p>
                                <SimpleTable
                                    columns={[
                                        {
                                            key: "label",
                                            label: "Document",
                                            render: (row: EmployeeDocumentRow) => (
                                                <span className="flex items-center gap-2 font-medium text-foreground">
                                                    <FileText className="size-4 text-muted-foreground" />
                                                    {row.label}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "status",
                                            label: "Status",
                                            render: (row) => (
                                                <StatusBadge
                                                    status={
                                                        row.onFile
                                                            ? { label: "On file", tone: "success" }
                                                            : { label: "Missing", tone: "warning" }
                                                    }
                                                />
                                            ),
                                        },
                                        {
                                            key: "open",
                                            label: "",
                                            className: "text-right",
                                            render: (row) =>
                                                mayOpen && row.urls.length > 0 ? (
                                                    <span className="inline-flex flex-wrap justify-end gap-2">
                                                        {row.urls.map((url, index) => (
                                                            <Button
                                                                key={url}
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 bg-card"
                                                                onClick={() => void open(row, url)}
                                                            >
                                                                {row.urls.length > 1 ? `Open ${index + 1}` : "Open"}
                                                            </Button>
                                                        ))}
                                                    </span>
                                                ) : null,
                                        },
                                    ]}
                                    rows={employee.documents}
                                    rowKey={(row) => row.key}
                                />
                            </div>
                        ),
                    },
                    {
                        value: "tasks",
                        label: "Tasks",
                        /* Lot AA: the person's open tasks in the console's Tasks section, by their user id. */
                        content: <AssignedTasksCard userId={employee.userId} name={employee.name} />,
                    },
                    {
                        value: "accounts",
                        label: "Account access",
                        content: (
                            <div className="grid gap-4 xl:grid-cols-2">
                                <SectionCard title="Console account" description="Roles, sessions and the console role are managed under Users">
                                    <FieldList
                                        items={[
                                            ["Email", employee.email ?? "—"],
                                            ["Mobile", employee.mobile ?? "—"],
                                        ]}
                                    />
                                    <Button variant="outline" className="mt-4 bg-card" asChild>
                                        <Link href={`/users/${employee.userId}`}>Open the user account</Link>
                                    </Button>
                                </SectionCard>
                                <SectionCard title="Employee KYC" description="On the queue from the moment the row exists; asked for, or recorded at the desk, then decided">
                                    <FieldList
                                        items={[
                                            /* N3-C: the party read's own state — the queue row's word. */
                                            ["State", <StatusBadge key="kyc" status={KYC_STATE_META[employee.kyc.state]} />],
                                            ["Documents", kyc ? `${kyc.documents} of 7` : "—"],
                                            ["Submitted", kyc ? formatDate(kyc.submittedAt) : "—"],
                                        ]}
                                    />
                                    {isLive("kyc") && (
                                        <KycRowActions
                                            className="mt-4"
                                            size="default"
                                            state={employee.kyc.state}
                                            party={employee.name}
                                            hasAccount
                                            contact={employee.mobile}
                                            request={requestOf({ requestedAt: employee.kyc.requestedAt, requestedChannel: employee.kyc.requestedChannel, submittedAt: employee.kyc.submittedAt })}
                                            caseHref={kyc || employee.kyc.kycId ? `/kyc/employees/${employee.id}` : null}
                                            onDigio={() => employeeKycService.requestDigio(employee.id)}
                                            onRequest={(channel, note) => employeeKycService.request(employee.id, channel, note)}
                                            onRecord={() => router.push(`/kyc/employees/${employee.id}`)}
                                            onChanged={onChanged}
                                        />
                                    )}
                                </SectionCard>
                                <SectionCard
                                    title="Remove this record"
                                    description="Takes the HR record off the directory; the user account and its roles stay"
                                    className="xl:col-span-2"
                                >
                                    <Button
                                        variant="outline"
                                        className="bg-card text-danger hover:text-danger"
                                        onClick={() => setRemoving(true)}
                                        disabled={busy}
                                    >
                                        <Trash2 className="size-4" />
                                        Remove HR record
                                    </Button>
                                </SectionCard>
                            </div>
                        ),
                    },
                ]}
            />

            <EditEmployeeDialog employee={employee} open={editing} onOpenChange={setEditing} onSaved={onChanged} />
            <ConfirmDialog
                open={removing}
                onOpenChange={(open) => !open && setRemoving(false)}
                title={`Remove ${employee.name}'s HR record?`}
                description="The record, its EMP id and its document links are deleted. The console account, its roles and any KYC decision are not touched."
                confirmLabel="Remove record"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
            />
        </>
    );
}
