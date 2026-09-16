"use client";

import { notFound } from "next/navigation";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { ApiError } from "@/lib/api-client";
import { isLive } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { qrService, type ScanByRow } from "@/services/qr";
import { rolesService, type RoleConfig } from "@/services/roles";
import {
    accountLifecycleService,
    usersService,
    type ErasureRequest,
    type WireActivity,
    type WireContacts,
    type WireSession,
    type WireUserDetail,
} from "@/services/users";
import { UsersOffline } from "../users-nav";
import { UserDetail } from "./user-detail";

interface Loaded {
    user: WireUserDetail | null;
    /** E6: their open sessions. Null when the read failed; the section says so. */
    sessions: WireSession[] | null;
    /** E6: their recent activity. Null when the read failed. */
    activity: WireActivity[] | null;
    /** K-B1: the primary pair and the contact rows. Null when the read failed. */
    contacts: WireContacts | null;
    /** K-B1: what they have scanned. Null when the read failed. */
    scans: ScanByRow[] | null;
    /** The open erasure request against the account, if any. */
    erasure: ErasureRequest | null;
    roles: RoleConfig[];
}

const empty: Loaded = { user: null, sessions: null, activity: null, contacts: null, scans: null, erasure: null, roles: [] };

/**
 * One account's data.
 *
 * `GET /users/:id` carries the account facts, the roles, the counts and the
 * parties itself (K-B1). The sessions, the activity, the contacts, the QR
 * scans and the open erasure request are read beside it — each on its own,
 * so one failing leaves its card saying so rather than the page. The role
 * list is only asked for when the person can hold one.
 */
export function UserLoader({ id }: { id: string }) {
    const live = isLive("users");
    const resource = useApiResource<Loaded>(`users:detail:${id}:${live}`, async () => {
        let user: WireUserDetail;
        try {
            user = await usersService.get(id);
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 404) return empty;
            throw caught;
        }
        const [sessions, activity, contacts, scans, erasure, roles] = await Promise.all([
            usersService.sessionsOf(id).catch(() => null),
            usersService.activityOf(id).catch(() => null),
            usersService.contactsOf(id).catch(() => null),
            isLive("qr") ? qrService.scansBy({ scannedById: id }).catch(() => null) : Promise.resolve(null),
            accountLifecycleService.openErasure(id).catch(() => null),
            user.roles.includes("ADMIN") && isLive("roles")
                ? rolesService.list().catch(() => [] as RoleConfig[])
                : Promise.resolve([] as RoleConfig[]),
        ]);
        return { user, sessions, activity, contacts, scans, erasure, roles };
    });

    if (!live) return <UsersOffline title="User" subtitle="One account on the marketplace" />;

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.user) notFound();
                return (
                    <UserDetail
                        user={data.user}
                        sessions={data.sessions}
                        activity={data.activity}
                        contacts={data.contacts}
                        scans={data.scans}
                        erasure={data.erasure}
                        roles={data.roles}
                        onChanged={resource.reload}
                    />
                );
            }}
        </ResourceBoundary>
    );
}
