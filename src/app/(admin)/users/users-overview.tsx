"use client";

import { BreakdownTable, CountTile, MixBar, SectionOverviewLoader, SeriesCard, StatTile } from "@/components/adx/overview";
import { formatNumber, formatPct } from "@/lib/format";
import { SECTION_META, consoleHref, typedSpellingsHover, type UsersOverview } from "@/services/section-overviews";
import { UsersNav } from "./users-nav";

const meta = SECTION_META.users;

/**
 * The Users section's Overview tab — package O-C over
 * `GET /section-overviews/users`: the logins (every account, whatever its
 * role), by role, the console's own operators' second factor, closures
 * and erasure requests, contacts verified, the two day series (sign-ups,
 * and sign-ins — the platform keeps only the latest sign-in per login,
 * so a previous window counts only logins whose latest is still in it),
 * and the by-role, by-language and by-city breakdowns.
 */
export function UsersOverviewView() {
    return (
        <SectionOverviewLoader
            section="users"
            title="Users"
            subtitle="Every account on the marketplace — the window's movement against the same number of days before it."
            nav={<UsersNav />}
        >
            {(data, window) => <UsersOverviewBody data={data} link={(href: string | null) => consoleHref("users", href, window)} />}
        </SectionOverviewLoader>
    );
}

export function UsersOverviewBody({ data, link }: { data: UsersOverview; link: (href: string | null) => string | null }) {
    const { tiles, series, breakdowns } = data;
    const roles = tiles.byRole;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Accounts" figure={tiles.total} hint="as at the window's close" href={meta.directory} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="signed up" />
                <CountTile label="Signed in" figure={tiles.active} hint="latest sign-in in the window" />
                <CountTile label="Closed in window" figure={tiles.closedInWindow} href="/users/closures" />
                <CountTile label="Closed" figure={tiles.closed} hint="as of now" href="/users/closures" />
                <CountTile label="Erasure requests open" figure={tiles.erasureRequestsOpen} hint="pending or approved, as of now" href="/users/erasure" />
                <StatTile
                    label="Admins with 2FA"
                    value={`${formatNumber(tiles.twoFactor.enrolled)} / ${formatNumber(tiles.twoFactor.admins)}`}
                    delta={null}
                    previous={null}
                    hint={`${formatPct(tiles.twoFactor.sharePct)} enrolled, as of now`}
                    href="/users/admins"
                />
                <StatTile
                    label="Contacts verified"
                    value={`${formatNumber(tiles.contactsVerified.verified)} / ${formatNumber(tiles.contactsVerified.total)}`}
                    delta={null}
                    previous={null}
                    hint={`${formatPct(tiles.contactsVerified.sharePct)} of contacts, as of now`}
                />
            </div>

            <MixBar
                title="By role"
                hint="Role grants per login, as of now — an agent holds one or both agent roles; a login with no role row is counted under none."
                items={[
                    { key: "publisher", label: "Publishers", count: roles.publisher, href: `${meta.directory}?role=PUBLISHER`, tone: "info" },
                    { key: "advertiser", label: "Advertisers", count: roles.advertiser, href: `${meta.directory}?role=ADVERTISER`, tone: "success" },
                    { key: "agent", label: "Agents", count: roles.agent, href: null, tone: "warning" },
                    { key: "printPartner", label: "Print partners", count: roles.printPartner, href: `${meta.directory}?role=PARTNER`, tone: "neutral" },
                    { key: "admin", label: "Admins", count: roles.admin, href: "/users/admins", tone: "danger" },
                    { key: "none", label: "No role", count: roles.none, href: null, tone: "neutral" },
                ]}
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <SeriesCard id="sign-ups" title="Sign-ups" hint="Accounts created, by day" series={series.signUps} />
                <SeriesCard id="sign-ins" title="Sign-ins" hint="Latest sign-in per login, by day — earlier sign-ins are not kept" series={series.signIns} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <BreakdownTable
                    title="By role"
                    hint="Role rows per role — the accounts directory under that role."
                    labelHeading="Role"
                    page={breakdowns.byRole}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Logins", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By language"
                    hint="The language each login chose."
                    labelHeading="Language"
                    page={breakdowns.byLanguage}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Logins", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By city"
                    hint="Publisher, advertiser and agent profiles' cities, summed — a login with two profiles in one city counts twice. A city narrows this overview."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[{ key: "count", label: "Profiles", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
            </div>
        </>
    );
}
