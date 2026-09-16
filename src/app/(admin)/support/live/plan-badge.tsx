import { cn } from "@/lib/utils";
import { planReasonLabel, type PlanOnDesk } from "@/services/live-chat";

/**
 * The plan behind a live chat, beside the requester's name.
 *
 * Live chat is a paid feature, so the plan is what makes this person entitled
 * to the desk at all and the badge the operator most wants. It is drawn from
 * `plan: { name, reason }` on the inbox row and on the thread read — the plan
 * held *now*, not when the chat opened — and the tooltip carries the reason.
 * `PLAN_EXCLUDED` is drawn in the warning colour: paying, but on a tier that
 * leaves live chat out, which is the case the operator should be told about
 * rather than left to infer. Nothing is drawn with no plan, because nothing
 * is known.
 */
export function PlanBadge({ plan, className }: { plan: PlanOnDesk; className?: string }) {
    if (!plan) return null;
    const excluded = plan.reason === "PLAN_EXCLUDED";
    return (
        <span
            title={planReasonLabel(plan.reason)}
            data-testid="plan-badge"
            className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                excluded ? "bg-warning-soft text-warning" : "bg-info-soft text-info",
                className,
            )}
        >
            {plan.name}
        </span>
    );
}
