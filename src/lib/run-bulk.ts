import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";

/**
 * Applies an action to every selected row and reports honestly on the result.
 *
 * There are no bulk endpoints behind this — each row is its own request. That is
 * a deliberate trade at ops scale, where a selection is tens of rows rather than
 * thousands: it needs no new API surface, and every action already has a single
 * endpoint that has been tested.
 *
 * What it must not do is pretend. `allSettled` rather than `all`, because the
 * failure that matters is the partial one: eleven of twelve succeeding and the
 * screen saying "done" is how somebody discovers the twelfth a week later. The
 * toast names both numbers whenever they differ.
 *
 * `eligible` is filtered by the caller before it gets here — "retire selected"
 * on a selection that includes already-retired rows should retire the rest and
 * say so, not fail on the ones that were already done.
 */
export async function runBulk<T>(
    rows: T[],
    action: (row: T) => Promise<unknown>,
    verb: string,
    onDone: () => void
): Promise<void> {
    if (rows.length === 0) {
        toast.info(`Nothing to ${verb.toLowerCase()}`, {
            description: "None of the selected rows are in a state this applies to.",
        });
        return;
    }

    const results = await Promise.allSettled(rows.map((row) => action(row)));
    const failed = results.filter((result) => result.status === "rejected");

    if (failed.length === 0) {
        toast.success(`${verb} ${rows.length}`);
    } else if (failed.length === rows.length) {
        const first = failed[0];
        toast.error(`Could not ${verb.toLowerCase()} any of them`, {
            description:
                first?.status === "rejected" && first.reason instanceof ApiError
                    ? first.reason.message
                    : undefined,
        });
    } else {
        toast.warning(`${verb} ${rows.length - failed.length} of ${rows.length}`, {
            description: `${failed.length} could not be changed. Reload and try those again.`,
        });
    }

    onDone();
}
