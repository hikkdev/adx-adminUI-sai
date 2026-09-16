"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { useNow } from "@/lib/use-now";
import { employeesService, istDateOf, type Person } from "@/services/employees";
import { ALL_OVERLAYS, monthOf, monthRange, scheduleService, type ScheduleLogPage, type ScheduleWindow } from "@/services/schedule";
import { ScheduleView } from "./schedule-view";

/**
 * The diary's data.
 *
 * Three reads, three keys. The window is the month on screen — `from` and
 * `to` are its first and last day — narrowed to one person when one is
 * picked, and only then asked to overlay their field work; a change of
 * month or person refetches. The log covers the same month and is read
 * again after every write, because a write is what it records. The people
 * registry fills the two pickers and is keyed on the "Show former" switch
 * (`?includeInactive=`, E10-1); the assignee on every card and log row is
 * named by the row itself (`assignee { id, name }`), so a person who has
 * left is still named whether or not the registry lists them.
 *
 * Today comes from the clock (`useNow`, null on the server and the first
 * client render), cut against the Indian calendar the server uses; until
 * it is known there is no month to ask for, and the page waits rather
 * than guessing one.
 */
export function ScheduleLoader() {
    const live = isLive("schedule");
    const now = useNow();
    const today = now === null ? null : istDateOf(now);

    /** Null until the operator navigates; the month today is in until then. */
    const [view, setView] = React.useState<{ year: number; month: number } | null>(null);
    const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
    const [person, setPerson] = React.useState<string | null>(null);
    const [showFormer, setShowFormer] = React.useState(false);

    const shownView = view ?? (today ? monthOf(today) : null);
    const range = shownView ? monthRange(shownView.year, shownView.month) : null;
    const rangeKey = range ? `${range.from}:${range.to}` : "-";

    const diary = useApiResource<ScheduleWindow | null>(`schedule:window:${rangeKey}:${person ?? ""}:${live}`, () =>
        live && range
            ? scheduleService.window({
                  from: range.from,
                  to: range.to,
                  ...(person ? { assigneeUserId: person, include: ALL_OVERLAYS } : {}),
              })
            : Promise.resolve(null),
    );

    const log = useApiResource<ScheduleLogPage | null>(`schedule:log:${rangeKey}:${live}`, () =>
        live && range ? scheduleService.log(range.from, range.to) : Promise.resolve(null),
    );

    const people = useApiResource<Person[]>(`schedule:people:${showFormer}:${live}`, () =>
        live ? employeesService.people({ includeInactive: showFormer }).catch(() => [] as Person[]) : Promise.resolve([]),
    );

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title="Schedule" subtitle="Day by day staff assignments with a full change log." />
                <EmptyState
                    icon={PlugZap}
                    title="The schedule reads the API"
                    description="This console is running on fixtures, and there are no diary fixtures — an entry is a real hour on a real person's day. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the diary."
                />
            </div>
        );
    }

    const reloadAll = () => {
        diary.reload();
        log.reload();
    };

    return (
        <ResourceBoundary resource={diary}>
            {(data) =>
                data === null || today === null || shownView === null ? null : (
                    <ScheduleView
                        diary={data}
                        log={log.data}
                        logError={log.error}
                        people={people.data ?? []}
                        today={today}
                        view={shownView}
                        onViewChange={setView}
                        selectedDate={selectedDate ?? today}
                        onSelectDate={setSelectedDate}
                        person={person}
                        onPersonChange={setPerson}
                        showFormer={showFormer}
                        onShowFormerChange={setShowFormer}
                        onChanged={reloadAll}
                    />
                )
            }
        </ResourceBoundary>
    );
}
