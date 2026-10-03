import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "Remove HR record" — 2 Oct 2026 (the account lifecycle). The server keeps
 * an HR record that has KYC or activity on file (409 with the blockers).
 * What is pinned: a record with nothing on file is removed and the desk
 * goes back to the directory; a refused one says what is on file and
 * offers Deactivate instead, which switches the record off and keeps it.
 */

const backend = vi.hoisted(() => ({
    deletes: [] as string[],
    puts: [] as { path: string; body: unknown }[],
    refusal: null as null | { status: number; code: string; message: string; details?: unknown },
    reset() {
        this.deletes = [];
        this.puts = [];
        this.refusal = null;
    },
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/employees/directory/usr_emp",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth", () => ({
    useAuth: () => ({ user: { id: "usr_admin", name: "Priya", roles: ["ADMIN"] }, loading: false, can: () => true }),
}));
vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    // The KYC card's doors are not what is under test here.
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: (domain: string) => domain !== "kyc" };
});
vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const del = async (path: string) => {
        backend.deletes.push(path);
        if (backend.refusal) throw new actual.ApiError(backend.refusal.status, backend.refusal.code, backend.refusal.message, backend.refusal.details);
        return { message: "Removed" };
    };
    const put = async (path: string, body: unknown) => {
        backend.puts.push({ path, body });
        return { id: "emp_1", userId: "usr_emp", isActive: false, user: { name: "Meera", email: null, mobile: null } };
    };
    return { ...actual, api: { ...actual.api, delete: del, put } };
});

import type { EmployeeDetail } from "@/services/employees";
import { EmployeeProfile } from "./employee-profile";

const employee: EmployeeDetail = {
    id: "emp_1",
    userId: "usr_emp",
    displayId: "EMP-0001",
    externalHrmsId: null,
    name: "Meera Iyer",
    mobile: "+919800000001",
    email: "meera@adx.in",
    department: "Operations",
    departmentId: null,
    designation: "Ops executive",
    region: null,
    workMode: null,
    employmentType: null,
    isActive: true,
    status: "active",
    createdAt: "2026-09-01T09:00:00.000Z",
    kyc: { state: "PENDING", kycId: "ekyc_1", submittedAt: "2026-09-02T09:00:00.000Z", requestedAt: null, requestedChannel: null, method: "MANUAL" },
    hrmsLink: null,
    appointment: null,
    documentsMasked: false,
    documents: [],
};

beforeEach(() => {
    backend.reset();
    router.push.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
});

function openRemove(over: Partial<EmployeeDetail> = {}) {
    const onChanged = vi.fn();
    render(<EmployeeProfile employee={{ ...employee, ...over }} kyc={null} onChanged={onChanged} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Account access" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove HR record" }));
    return { onChanged };
}

describe("Remove HR record", () => {
    it("removes a record with nothing on file and goes back to the directory", async () => {
        openRemove();
        fireEvent.click(await screen.findByRole("button", { name: "Remove record" }));
        await waitFor(() => expect(router.push).toHaveBeenCalledWith("/employees/directory"));
        expect(backend.deletes).toEqual(["/employees/usr_emp"]);
    });

    it("refused (409 with the blockers): says what is on file and offers Deactivate instead", async () => {
        backend.refusal = {
            status: 409,
            code: "EMPLOYEE_HAS_HISTORY",
            message: "This HR record has history.",
            details: { blockers: [{ kind: "EMPLOYEE_KYC", label: "KYC record", count: 1 }, { kind: "ACTIVITY", label: "activity entries", count: 12 }] },
        };
        const { onChanged } = openRemove();
        fireEvent.click(await screen.findByRole("button", { name: "Remove record" }));

        expect(await screen.findByText("Meera Iyer's HR record can't be removed")).toBeInTheDocument();
        const blockers = screen.getByTestId("employee-remove-blockers");
        expect(blockers).toHaveTextContent("1 KYC record");
        expect(blockers).toHaveTextContent("12 activity entries");
        expect(router.push).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Deactivate instead" }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.puts).toEqual([{ path: "/employees/usr_emp", body: { isActive: false } }]);
        expect(toast.success).toHaveBeenCalledWith("Meera Iyer is deactivated", expect.anything());
    });

    it("an already-deactivated record that is refused says there is nothing more to do", async () => {
        backend.refusal = { status: 409, code: "EMPLOYEE_HAS_HISTORY", message: "This HR record has history." };
        openRemove({ isActive: false, status: "inactive" });
        fireEvent.click(await screen.findByRole("button", { name: "Remove record" }));
        expect(await screen.findByText(/already deactivated/)).toBeInTheDocument();
        expect(screen.getByTestId("employee-remove-blockers")).toHaveTextContent("This HR record has history.");
        expect(screen.queryByRole("button", { name: "Deactivate instead" })).toBeNull();
    });
});
