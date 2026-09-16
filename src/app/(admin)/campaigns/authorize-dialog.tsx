"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { campaignService } from "@/services/campaigns";
import { settingsService } from "@/services/settings";
import { usersService, type UserRow } from "@/services/users";

export interface AuthorizeTarget {
    id: string;
    name: string;
    reference: string;
    /** The total the review priced, when the caller has it — decides whether the rule is shown up front. */
    total?: string | null;
}

interface AuthorizeDialogProps {
    campaign: AuthorizeTarget | null;
    onOpenChange: (open: boolean) => void;
    onDone: () => void;
}

/**
 * Authorising on the advertiser's behalf (Lot C, Q88).
 *
 * Two guards on top of the ordinary authorise, both the API's: the campaign
 * reference typed back, and — at or above `finance.opsAuthoriseThreshold` —
 * a second admin named who is not the one pressing the button. The
 * threshold is read from the platform settings so the rule is stated before
 * the button is pressed; if the API answers 409 FOUR_EYES anyway, the dialog
 * asks for the second admin rather than failing.
 */
export function AuthorizeDialog({ campaign, onOpenChange, onDone }: AuthorizeDialogProps) {
    const { user } = useAuth();
    const [confirm, setConfirm] = React.useState("");
    const [approver, setApprover] = React.useState<string>("");
    const [busy, setBusy] = React.useState(false);
    const [threshold, setThreshold] = React.useState<number | null>(null);
    const [admins, setAdmins] = React.useState<UserRow[] | null>(null);
    const [fourEyes, setFourEyes] = React.useState<{ total: string; threshold: string } | null>(null);

    const open = campaign !== null;

    React.useEffect(() => {
        if (!open) return;
        let active = true;
        settingsService
            .get()
            .then((settings) => {
                if (active) setThreshold(settings.finance.opsAuthoriseThreshold ?? null);
            })
            .catch(() => {
                /* The rule is then shown only when the API raises it. */
            });
        return () => {
            active = false;
        };
    }, [open]);

    const aboveThreshold =
        fourEyes !== null ||
        (threshold !== null && campaign?.total !== undefined && campaign.total !== null && Number(campaign.total) >= threshold);

    React.useEffect(() => {
        if (!open || !aboveThreshold || admins !== null) return;
        let active = true;
        usersService
            .list({ closed: false })
            .then((rows) => {
                if (active) setAdmins(rows.filter((row) => row.roles.includes("ADMIN") && row.status === "active"));
            })
            .catch(() => {
                if (active) setAdmins([]);
            });
        return () => {
            active = false;
        };
    }, [open, aboveThreshold, admins]);

    const reset = () => {
        setConfirm("");
        setApprover("");
        setFourEyes(null);
    };

    const typedRight = campaign !== null && confirm.trim() === campaign.reference;
    const needsApprover = aboveThreshold && !approver;

    const submit = async () => {
        if (!campaign || !typedRight) return;
        setBusy(true);
        try {
            const result = await campaignService.authorize(campaign.id, {
                confirm: confirm.trim(),
                ...(approver ? { approvedByUserId: approver } : {}),
            });
            toast.success(`${campaign.name} authorised`, {
                description: result.incentive
                    ? `Launched out of the advertiser's wallet. The agent's assist incentive (${formatMoney(result.incentive.amount)}) is recorded for finance.`
                    : "Launched out of the advertiser's wallet.",
            });
            reset();
            onDone();
        } catch (error) {
            if (error instanceof ApiError && error.code === "FOUR_EYES") {
                const details = error.details as { total?: string; threshold?: string } | undefined;
                setFourEyes({ total: details?.total ?? campaign.total ?? "", threshold: details?.threshold ?? String(threshold ?? "") });
                toast.warning("A second admin has to approve this one", { description: error.message });
            } else {
                toast.error(error instanceof Error ? error.message : "Could not authorise it");
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !busy) {
                    reset();
                    onOpenChange(false);
                }
            }}
        >
            <DialogContent className="max-w-md">
                {campaign && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Authorise {campaign.name} on the advertiser&rsquo;s behalf?</DialogTitle>
                            <DialogDescription>
                                The money is taken from the advertiser&rsquo;s wallet now — a recorded bank transfer or a gateway
                                capture that was never applied — and the campaign launches. The advertiser is told, and the
                                authorisation is audited under your name.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="authorise-confirm">
                                    Type the campaign reference to confirm: <span className="font-mono">{campaign.reference}</span>
                                </Label>
                                <Input
                                    id="authorise-confirm"
                                    value={confirm}
                                    onChange={(event) => setConfirm(event.target.value)}
                                    placeholder={campaign.reference}
                                    autoComplete="off"
                                    className="font-mono"
                                />
                            </div>

                            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground">The four-eyes rule</p>
                                <p className="mt-0.5">
                                    {threshold !== null
                                        ? `At or above ${formatMoney(threshold.toFixed(2))}, a second admin — not you — has to approve authorising on the advertiser's behalf. The API refuses it otherwise.`
                                        : "Above the platform's ops-authorise threshold, a second admin — not you — has to approve. The API says so when it applies."}
                                    {campaign.total ? ` This campaign comes to ${formatMoney(campaign.total)}.` : ""}
                                </p>
                            </div>

                            {aboveThreshold && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="authorise-approver">Second admin</Label>
                                    <Select value={approver} onValueChange={setApprover}>
                                        <SelectTrigger id="authorise-approver">
                                            <SelectValue placeholder={admins === null ? "Loading admins…" : "Choose who approved this"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(admins ?? [])
                                                .filter((row) => row.id !== user?.id)
                                                .map((row) => (
                                                    <SelectItem key={row.id} value={row.id}>
                                                        {row.displayName}
                                                        {row.email ? ` · ${row.email}` : ""}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-muted-foreground">
                                        {fourEyes
                                            ? `The API refused: ${formatMoney(fourEyes.total)} is at or above the ${formatMoney(fourEyes.threshold)} threshold.`
                                            : "Their approval is recorded on the authorisation beside yours."}
                                    </p>
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button disabled={busy || !typedRight || needsApprover} onClick={submit}>
                                Authorise and launch
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
