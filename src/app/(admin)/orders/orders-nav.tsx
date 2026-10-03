import { SubNav } from "@/components/adx/sub-nav";

/**
 * OM-1: the Orders section's tabs (the owner, 25 September 2026).
 *
 * Bookings and Orders were one list drawn twice. There is no booking record:
 * `/bookings` read `GET /orders`, its rows opened `/orders/:id`, and what
 * differed was which features each copy got — search, sort and paging on
 * one, the pipeline on the other. The list here is the better half of each.
 *
 * Three views of the same orders: the list, the calendar by listing, and the
 * kanban by stage. The list is exact so the other two do not light it.
 *
 * Order screening (2 Oct 2026) adds a fourth: the orders the automatic
 * score flagged, for a person to hold, release, clear or cancel as fraud.
 */
export function OrdersNav() {
    return (
        <SubNav
            items={[
                { label: "List", href: "/orders", exact: true },
                { label: "Calendar", href: "/orders/calendar" },
                { label: "Pipeline", href: "/orders/pipeline" },
                { label: "Fraud review", href: "/orders/fraud-review" },
            ]}
        />
    );
}
