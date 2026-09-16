import type { Metadata } from "next";
import { DashboardLoader } from "./dashboard-loader";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
    // The tiles, the recent bookings, the payout runs and the assign card all
    // fetch their own data in the browser — this is a server component with
    // no token, and nothing on the dashboard is drawn from a seed any more.
    // The assign card's roster comes from `GET /agents`, the same read the
    // agents screens make; the `src/data/directory` fallback it used to be
    // handed is gone with the domain.
    return <DashboardLoader />;
}
