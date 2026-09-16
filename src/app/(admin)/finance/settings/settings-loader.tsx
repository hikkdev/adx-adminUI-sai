"use client";

import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import {
    financeReadsApi,
    financeService,
    type BankAccount,
    type IncentiveRate,
    type PayoutSchedule,
    type RailStatus,
    type TaxRate,
    type WithdrawalLimit,
} from "@/services/finance";
import { settingsService, type FinanceSettings, type InstallationCommissionMode } from "@/services/settings";
import { invoicesService, type LegalEntity } from "@/services/invoices";
import { FinanceNav } from "../finance-nav";
import { FinanceOffline } from "../finance-offline";
import { SettingsView } from "./settings-view";

interface Loaded {
    limits: WithdrawalLimit[];
    taxRates: TaxRate[];
    incentiveRates: IncentiveRate[];
    /** Lot B: ADX as the supplier on every invoice. */
    legalEntity: LegalEntity | null;
    /** Lot B (Q102): `installation.commissionMode` off the platform settings row. Null when that read failed. */
    installationMode: InstallationCommissionMode | null;
    /** Lot B (Q85): the accounts a batch is drawn on and a statement is imported for. */
    bankAccounts: BankAccount[];
    /** Lot B (Q85): the `finance` section of the same platform row. Null when that read failed. */
    financeSettings: FinanceSettings | null;
    /** Which rails have credentials, so a primary rail nobody configured is said to be one. */
    rails: RailStatus[];
    /** Lot G (Q124): the weekly draft's next instant and last batch. Null when that read failed. */
    schedule: PayoutSchedule | null;
}

/**
 * All three rule tables at once.
 *
 * They are read together because they are read together by a person: a cap that
 * has moved and a TDS rate that has not are the same conversation, and reading
 * them on three separate screens is how one of them gets forgotten.
 *
 * `GET /finance/limits` and `GET /finance/tax-rates` seed their defaults on
 * first read, so an empty database answers with the ladder and the two zero
 * rates rather than with nothing. `GET /finance/legal-entity` does the same:
 * the one row is created empty the first time anybody asks for it.
 */
export function SettingsLoader() {
    const live = financeReadsApi();

    const resource = useApiResource<Loaded>(`finance:settings:${live}`, async () => {
        if (!live) {
            return {
                limits: [],
                taxRates: [],
                incentiveRates: [],
                legalEntity: null,
                installationMode: null,
                bankAccounts: [],
                financeSettings: null,
                rails: [],
                schedule: null,
            };
        }
        const [limits, taxRates, incentiveRates, legalEntity, platform, bankAccounts, rails, schedule] = await Promise.all([
            financeService.limits(),
            financeService.taxRates(),
            financeService.incentiveRates(),
            invoicesService.legalEntity(),
            /* The mode rides on the platform row, a different module; a
               failed read leaves the rule tables standing and the toggle
               says it could not load, rather than the whole page. */
            settingsService.get().catch(() => null),
            financeService.bankAccounts(),
            financeService.rails(),
            financeService.payoutSchedule().catch(() => null),
        ]);
        return {
            limits,
            taxRates,
            incentiveRates,
            legalEntity,
            installationMode: platform?.installation.commissionMode ?? null,
            bankAccounts,
            financeSettings: platform?.finance ?? null,
            rails,
            schedule,
        };
    });

    return (
        <div className="space-y-5">
            <FinanceNav />
            {live ? (
                <ResourceBoundary resource={resource}>
                    {(data) => (
                        <SettingsView
                            limits={data.limits}
                            taxRates={data.taxRates}
                            incentiveRates={data.incentiveRates}
                            legalEntity={data.legalEntity}
                            installationMode={data.installationMode}
                            bankAccounts={data.bankAccounts}
                            financeSettings={data.financeSettings}
                            rails={data.rails}
                            schedule={data.schedule}
                            onChanged={resource.reload}
                        />
                    )}
                </ResourceBoundary>
            ) : (
                <FinanceOffline what="A withdrawal cap, a tax rate and an incentive rate" />
            )}
        </div>
    );
}
