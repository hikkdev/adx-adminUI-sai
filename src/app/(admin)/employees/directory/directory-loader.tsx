"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { departmentsService } from "@/services/departments";
import { employeesService, type EmployeesPage } from "@/services/employees";
import { EmployeesNav, EmployeesOffline } from "../employees-nav";
import type { SortingState } from "@tanstack/react-table";
import { INITIAL_DIRECTORY_SORT, sortParamsOf, type DirectoryPageSize } from "./directory-sort";
import { DirectoryTable, type DirectoryActivity } from "./directory-table";

/** One server page until Rows per page says otherwise. The table draws it whole and the pager below it walks the rest. */
export const DIRECTORY_PAGE_SIZE: DirectoryPageSize = 10;

/**
 * The directory's data — E10-1: one page of `GET /employees` on the list
 * contract. The search, the department, the active chip and the page all
 * go to the API and sit in the resource key, so a change refetches rather
 * than filtering the one page the console holds; `total` is the size of
 * the whole result and `counts` says how many each chip would show. Lot G
 * (Q113, package CG1; G13-B adds Region): so do the sort (`?sort=&dir=`, Employee / Role / Region /
 * Joined) and the page size (Rows per page, 10 / 25 / 50 / 100).
 *
 * The department picker's options are the department records (Lot G,
 * Q122: `GET /hr/departments`, every row) — the page in hand cannot name a
 * department it holds nobody from, and a record is a department whether or
 * not anyone is in it yet. The API's `?department=` matches the record's
 * name, so the name is what goes on the wire. That read fails soft to an
 * empty picker.
 */
export function DirectoryLoader() {
    const live = isLive("employees");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim(), 350);
    const [department, setDepartment] = React.useState("");
    const [activity, setActivity] = React.useState<DirectoryActivity>("ALL");
    const [page, setPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState<DirectoryPageSize>(DIRECTORY_PAGE_SIZE);
    const [sorting, setSorting] = React.useState<SortingState>(INITIAL_DIRECTORY_SORT);
    const sortParams = sortParamsOf(sorting);

    const resource = useApiResource<EmployeesPage>(
        `employees:directory:${settledQ}:${department}:${activity}:${sortParams?.sort ?? ""}:${sortParams?.dir ?? ""}:${page}:${pageSize}:${live}`,
        () =>
            live
                ? employeesService.page({
                      ...(settledQ ? { q: settledQ } : {}),
                      ...(department ? { department } : {}),
                      ...(activity === "ALL" ? {} : { active: activity === "ACTIVE" }),
                      ...(sortParams ?? {}),
                      page,
                      pageSize,
                  })
                : Promise.resolve({ rows: [], total: 0, page: 1, pageSize, counts: {} }),
    );

    const departments = useApiResource<string[]>(`employees:directory:departments:${live}`, () =>
        live
            ? departmentsService
                  .listAll()
                  .then((rows) => rows.map((row) => row.name))
                  .catch(() => [] as string[])
            : Promise.resolve([] as string[]),
    );

    /* A new search, department or chip starts from the first page: page 4
       of a narrower result is usually empty, and "nobody" would be a lie. */
    const changeQ = (next: string) => {
        setQ(next);
        setPage(1);
    };
    const changeDepartment = (next: string) => {
        setDepartment(next);
        setPage(1);
    };
    const changeActivity = (next: DirectoryActivity) => {
        setActivity(next);
        setPage(1);
    };
    const changeSorting = (next: SortingState) => {
        setSorting(next);
        setPage(1);
    };
    const changePageSize = (next: DirectoryPageSize) => {
        setPageSize(next);
        setPage(1);
    };

    if (!live) return <EmployeesOffline title="Directory" subtitle="Everyone with an HR record." />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <div className="space-y-5">
                    <PageHeader
                        title="Directory"
                        subtitle={`${data.total} ${data.total === 1 ? "person" : "people"} on the ADX team.`}
                        actions={
                            <Button asChild>
                                <Link href="/employees/new">
                                    <Plus className="size-4" />
                                    Add employee
                                </Link>
                            </Button>
                        }
                    />
                    <EmployeesNav />
                    <DirectoryTable
                        page={data}
                        q={q}
                        onQChange={changeQ}
                        department={department}
                        departments={departments.data ?? []}
                        onDepartmentChange={changeDepartment}
                        activity={activity}
                        onActivityChange={changeActivity}
                        pageNumber={page}
                        onPageChange={setPage}
                        pageSize={pageSize}
                        onPageSizeChange={changePageSize}
                        sorting={sorting}
                        onSortingChange={changeSorting}
                    />
                </div>
            )}
        </ResourceBoundary>
    );
}
