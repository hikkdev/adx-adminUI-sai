"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import {
    isSubscriptionOrderStatus,
    isSubscriptionState,
    revenueService,
    type PublisherPlan,
    type SubscriptionOrderStatus,
    type SubscriptionOrdersPage,
    type SubscriptionState,
    type SubscriptionsPage,
} from "@/services/revenue";
import { settingsReadApi, settingsService } from "@/services/settings";
import { OrdersView } from "./orders-view";
import { SubscriptionsView } from "./subscriptions-view";

export const SUBSCRIPTIONS_TITLE = "Publisher subscriptions";
export const SUBSCRIPTIONS_SUBTITLE = "Every plan a publisher holds, and every order the app has raised for one";

/** One server page of orders, and of subscriptions. The table draws it whole and the pager below it walks the rest. */
export const ORDERS_PAGE_SIZE = 25;
export const SUBSCRIPTIONS_PAGE_SIZE = 25;

const EMPTY_SUBSCRIPTIONS: SubscriptionsPage = {
    items: [],
    total: 0,
    page: 1,
    pageSize: SUBSCRIPTIONS_PAGE_SIZE,
    counts: { RUNNING: 0, UPCOMING: 0, ENDED: 0 },
};

export type DeskTab = "subscriptions" | "orders";
const isTab = (value: string | null): value is DeskTab => value === "subscriptions" || value === "orders";

export interface DeskFacets {
    tab: DeskTab;
    state: SubscriptionState | "ALL";
    status: SubscriptionOrderStatus | "ALL";
    publisherId: string;
    page: number;
}

/** The URL for a set of facets, with nothing written that is the default. */
export function facetsHref(pathname: string, facets: DeskFacets): string {
    const query = new URLSearchParams();
    if (facets.tab !== "subscriptions") query.set("tab", facets.tab);
    if (facets.state !== "ALL") query.set("state", facets.state);
    if (facets.status !== "ALL") query.set("status", facets.status);
    if (facets.publisherId) query.set("publisherId", facets.publisherId);
    if (facets.page > 1) query.set("page", String(facets.page));
    const search = query.toString();
    return search ? `${pathname}?${search}` : pathname;
}

/** The facets the URL names; anything unknown is the default. */
export function readFacets(params: URLSearchParams): DeskFacets {
    const tab = params.get("tab");
    const state = params.get("state");
    const status = params.get("status");
    const page = Number(params.get("page") ?? "1");
    return {
        tab: isTab(tab) ? tab : "subscriptions",
        state: isSubscriptionState(state) ? state : "ALL",
        status: isSubscriptionOrderStatus(status) ? status : "ALL",
        publisherId: params.get("publisherId")?.trim() ?? "",
        page: Number.isInteger(page) && page > 1 ? page : 1,
    };
}

/**
 * The desk's data — Lot J-C.
 *
 * The tab and every facet sit in the URL (`?tab=&state=&status=&publisherId=&page=`)
 * so a link from a publisher's page lands on their rows and a reload keeps
 * the view. Both reads are the list contract (Lot J2, d): the facet, the
 * search and the page go to the API and the chip counts come back computed
 * without the facet in force; a subscription row names its publisher, so
 * there is no roster read. The search box is shared by the tabs and kept
 * out of the URL — it is the operator's typing, not a view.
 *
 * The platform row is read once for the publisher policy's grace, so an
 * ended row still inside it can say so; a failed read draws no grace.
 */
export function SubscriptionsLoader() {
    const live = isLive("finance");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = readFacets(params);
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim());

    const navigate = React.useCallback(
        (next: Partial<DeskFacets>) => {
            const current = readFacets(new URLSearchParams(params.toString()));
            router.replace(facetsHref(pathname, { ...current, ...next }));
        },
        [params, pathname, router],
    );

    const subscriptions = useApiResource<SubscriptionsPage>(
        `revenue:subscriptions:${facets.state}:${facets.publisherId}:${settledQ}:${facets.page}:${live}`,
        () =>
            live
                ? revenueService.subscriptionsPage({
                      ...(settledQ ? { q: settledQ } : {}),
                      ...(facets.state === "ALL" ? {} : { state: facets.state }),
                      ...(facets.publisherId ? { publisherId: facets.publisherId } : {}),
                      page: facets.page,
                      pageSize: SUBSCRIPTIONS_PAGE_SIZE,
                  })
                : Promise.resolve(EMPTY_SUBSCRIPTIONS),
    );

    const orders = useApiResource<SubscriptionOrdersPage>(
        `revenue:subscription-orders:${facets.status}:${facets.publisherId}:${settledQ}:${facets.page}:${live}`,
        () =>
            live
                ? revenueService.subscriptionOrders({
                      ...(settledQ ? { q: settledQ } : {}),
                      ...(facets.status === "ALL" ? {} : { status: [facets.status] }),
                      ...(facets.publisherId ? { publisherId: facets.publisherId } : {}),
                      page: facets.page,
                      pageSize: ORDERS_PAGE_SIZE,
                  })
                : Promise.resolve({
                      items: [],
                      total: 0,
                      page: 1,
                      pageSize: ORDERS_PAGE_SIZE,
                      counts: { PENDING_PAYMENT: 0, PAID: 0, CANCELLED: 0, EXPIRED: 0 },
                  }),
    );

    const plans = useApiResource<PublisherPlan[]>(`revenue:plans:${live}`, () =>
        live ? revenueService.plans() : Promise.resolve([]),
    );

    const settingsLive = settingsReadApi();
    const graceDays = useApiResource<number>(`revenue:subscriptions:grace:${settingsLive}`, () =>
        settingsLive
            ? settingsService
                  .get()
                  .then((settings) => settings.subscriptions?.publisher.graceDays ?? 0)
                  .catch(() => 0)
            : Promise.resolve(0),
    );

    /* A change of any facet lands on the first page. */
    const changeQ = (next: string) => {
        setQ(next);
        if (facets.page !== 1) navigate({ page: 1 });
    };

    if (!live) {
        return (
            <div className="space-y-6">
                <PageHeader title={SUBSCRIPTIONS_TITLE} subtitle={SUBSCRIPTIONS_SUBTITLE} />
                <EmptyState
                    icon={PlugZap}
                    title="Publisher subscriptions read the API"
                    description="A subscription is the commission rate a publisher is charged; there is nothing to show without the backend. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to see the book."
                />
            </div>
        );
    }

    const reloadAll = () => {
        subscriptions.reload();
        orders.reload();
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title={SUBSCRIPTIONS_TITLE}
                subtitle={SUBSCRIPTIONS_SUBTITLE}
                actions={
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/packages/catalogue">Edit the plans</Link>
                    </Button>
                }
            />

            {facets.publisherId && (
                <p className="text-sm text-muted-foreground">
                    Showing one publisher&apos;s rows.{" "}
                    <Link href={`/publishers/${encodeURIComponent(facets.publisherId)}`} className="underline underline-offset-4">
                        Open the publisher
                    </Link>
                    {" · "}
                    <Link href={facetsHref(pathname, { ...facets, publisherId: "", page: 1 })} className="underline underline-offset-4">
                        Show every publisher
                    </Link>
                </p>
            )}

            <Tabs value={facets.tab} onValueChange={(next) => navigate({ tab: isTab(next) ? next : "subscriptions", page: 1 })}>
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {[
                        { value: "subscriptions", label: "Subscriptions" },
                        { value: "orders", label: "Orders" },
                    ].map((tab) => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                        >
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            {facets.tab === "subscriptions" ? (
                <ResourceBoundary resource={subscriptions}>
                    {(page) => (
                        <SubscriptionsView
                            page={page}
                            q={q}
                            onQChange={changeQ}
                            state={facets.state}
                            onStateChange={(state) => navigate({ state, page: 1 })}
                            pageNumber={facets.page}
                            onPageChange={(page) => navigate({ page })}
                            pageSize={SUBSCRIPTIONS_PAGE_SIZE}
                            plans={plans.data ?? []}
                            graceDays={graceDays.data ?? 0}
                            onChanged={reloadAll}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <ResourceBoundary resource={orders}>
                    {(page) => (
                        <OrdersView
                            page={page}
                            q={q}
                            onQChange={changeQ}
                            status={facets.status}
                            onStatusChange={(status) => navigate({ status, page: 1 })}
                            pageNumber={facets.page}
                            onPageChange={(page) => navigate({ page })}
                            pageSize={ORDERS_PAGE_SIZE}
                            onChanged={reloadAll}
                        />
                    )}
                </ResourceBoundary>
            )}
        </div>
    );
}
