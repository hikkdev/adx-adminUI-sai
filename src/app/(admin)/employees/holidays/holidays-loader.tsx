"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { useNow } from "@/lib/use-now";
import { employeesService, istDateOf, type Holiday, type HolidayCalendarView } from "@/services/employees";
import { EmployeesOffline } from "../employees-nav";
import { HolidaysView } from "./holidays-view";

/**
 * The calendar for one year — `GET /hr/holidays?year=` — opening on the
 * year it is now in India and moving with the year picker. The list is
 * cut at today into "still to come" and "earlier this year" in the view.
 *
 * HC-1: beside it, `GET /hr/holidays/calendar` — the public calendar the
 * page follows and how its last sync went. That read failing does not hold
 * the list back: the line under the header is simply left out.
 */
export function HolidaysLoader() {
    const live = isLive("employees");
    const { can } = useAuth();
    const now = useNow();
    const today = now === null ? null : istDateOf(now);
    const [year, setYear] = React.useState<number | null>(null);
    const shownYear = year ?? (today ? Number(today.slice(0, 4)) : null);

    const resource = useApiResource<Holiday[]>(`employees:holidays:${shownYear ?? "-"}:${live}`, () =>
        live && shownYear !== null ? employeesService.holidays(shownYear) : Promise.resolve([]),
    );
    const calendar = useApiResource<HolidayCalendarView | null>(`employees:holiday-calendar:${live}`, () =>
        live ? employeesService.holidayCalendar() : Promise.resolve(null),
    );

    if (!live) return <EmployeesOffline title="Holidays" subtitle="The holiday calendar the staff diary shades." />;

    return (
        <ResourceBoundary resource={resource}>
            {(holidays) =>
                shownYear === null || today === null ? null : (
                    <HolidaysView
                        holidays={holidays}
                        year={shownYear}
                        today={today}
                        calendar={calendar.data}
                        maySync={can("hr.edit")}
                        onYearChange={setYear}
                        onChanged={resource.reload}
                        onSynced={() => {
                            resource.reload();
                            calendar.reload();
                        }}
                    />
                )
            }
        </ResourceBoundary>
    );
}
