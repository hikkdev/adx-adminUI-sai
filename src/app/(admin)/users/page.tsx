import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { UsersOverviewView } from "./users-overview";

export const metadata: Metadata = { title: "Users" };

/** The facets the accounts directory keeps in its URL — a link carrying one meant the table, and still lands on it. */
const DIRECTORY_FACETS = ["state", "role", "sort"] as const;

/**
 * The section's landing tab — package O-C: the overview over
 * `GET /section-overviews/users`. The accounts directory moved to
 * `/users/accounts`; a deep link that carried its facets (`/users?state=
 * closed`, `/users?role=ADMIN`) is sent there with them, since only the
 * directory honours those words. Suspense because the loader keeps the
 * window in the URL.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    if (DIRECTORY_FACETS.some((facet) => typeof params[facet] === "string")) {
        const query = new URLSearchParams();
        for (const facet of DIRECTORY_FACETS) {
            const value = params[facet];
            if (typeof value === "string") query.set(facet, value);
        }
        redirect(`/users/accounts?${query.toString()}`);
    }
    return (
        <Suspense fallback={null}>
            <UsersOverviewView />
        </Suspense>
    );
}
