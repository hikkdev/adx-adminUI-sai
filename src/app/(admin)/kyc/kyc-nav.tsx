import { STICKY_SECTION_BAR, SubNav } from "@/components/adx/sub-nav";
import { cn } from "@/lib/utils";
import { VerificationProvidersLine } from "@/components/adx/verification-providers";

/**
 * Section tabs shared by the KYC review queues — the five kinds of party ADX
 * verifies (Lot N adds the print partner) — and, under them on every tab,
 * the verification providers' health in one line (2 Oct 2026: shown the same
 * way on all five; the full table stays on Settings › Integrations ›
 * Verification routing).
 */
export function KycNav() {
  return (
    <div className={cn("space-y-2.5 pb-2", STICKY_SECTION_BAR)}>
      <SubNav
        sticky={false}
        items={[
          { label: "Publishers", href: "/kyc", exact: true },
          { label: "Advertisers", href: "/kyc/advertisers" },
          { label: "Print partners", href: "/kyc/print-partners" },
          { label: "Agents", href: "/kyc/agents" },
          { label: "Employees", href: "/kyc/employees" },
        ]}
      />
      <VerificationProvidersLine />
    </div>
  );
}
