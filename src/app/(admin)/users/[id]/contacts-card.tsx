"use client";

import * as React from "react";
import { BadgeCheck, Mail, Phone, Plus } from "lucide-react";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
    CONTACT_KIND_LABEL,
    USER_REASON_MAX,
    USER_REASON_MIN,
    contactTakenMessage,
    contactTakenOf,
    usersService,
    type ContactKind,
    type WireContact,
    type WireContacts,
} from "@/services/users";

/**
 * "Emails & phone numbers" — the contacts card on a person's page (K-B1).
 *
 * The primary pair is marked PRIMARY: the mobile is the sign-in identity
 * and the email is where reset links go. Every other row is a `UserContact`
 * with its kind, label, verified state and who added it, and each carries
 * the desk's six moves, every one a real route under `/users/:id/contacts`:
 *
 * - Add — kind, value, label, reason; the row starts unverified.
 * - Send code — a code to the contact itself, on the person's behalf; the
 *   desk never sees it.
 * - Verify — the code the person reads back over the phone.
 * - Mark verified — the desk's word, with a reason, no code typed.
 * - Make primary — the swap; the confirm names it and, for a phone, that
 *   every session on the old number ends.
 * - Remove — with a reason.
 *
 * A 409 CONTACT_TAKEN on Add is printed as whose the value already is.
 */

interface ContactsCardProps {
    userId: string;
    name: string;
    /** Null when the read failed; the card says so. */
    contacts: WireContacts | null;
    closed: boolean;
    onChanged: () => void;
}

type Ask =
    | { kind: "add" }
    | { kind: "verify"; contact: WireContact }
    | { kind: "mark-verified"; contact: WireContact }
    | { kind: "make-primary"; contact: WireContact }
    | { kind: "remove"; contact: WireContact };

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

export function ContactsCard({ userId, name, contacts, closed, onChanged }: ContactsCardProps) {
    const [ask, setAsk] = React.useState<Ask | null>(null);
    const [sending, setSending] = React.useState<string | null>(null);

    const sendCode = async (contact: WireContact) => {
        setSending(contact.id);
        try {
            const sent = await usersService.sendContactCode(userId, contact.id);
            toast.success(`Code sent to ${contact.value}`, {
                description: `It lasts ${Math.round(sent.expiresInSeconds / 60)} minutes; ${sent.sendsRemaining} more ${sent.sendsRemaining === 1 ? "send" : "sends"} today. Ask ${name} to read it back, then Verify.`,
            });
            setAsk({ kind: "verify", contact });
        } catch (caught) {
            toast.error(message(caught, "Could not send the code."));
        } finally {
            setSending(null);
        }
    };

    const close = () => setAsk(null);
    const done = () => {
        setAsk(null);
        onChanged();
    };

    return (
        <SectionCard
            title="Emails & phone numbers"
            description="The primary pair is where sign-in and reset links go; every other contact is a number or address the account answers to"
            actions={
                !closed && (
                    <Button variant="outline" size="sm" className="h-8 bg-card" onClick={() => setAsk({ kind: "add" })}>
                        <Plus className="size-4" />
                        Add
                    </Button>
                )
            }
            contentClassName="px-5 py-1"
        >
            {contacts === null ? (
                <p className="py-3 text-sm text-muted-foreground">The contacts could not be read just now.</p>
            ) : (
                <ul className="divide-y">
                    <PrimaryRow
                        kind="PHONE"
                        value={contacts.primary.mobile}
                        verified={Boolean(contacts.primary.mobileVerifiedAt)}
                        detail={contacts.primary.mobileVerifiedAt ? `Verified ${formatDateTime(contacts.primary.mobileVerifiedAt)}` : "Never verified with a code"}
                    />
                    {contacts.primary.email ? (
                        <PrimaryRow
                            kind="EMAIL"
                            value={contacts.primary.email}
                            verified={contacts.primary.emailVerified}
                            detail={contacts.primary.emailVerified ? "Has answered a code" : "No code answered yet"}
                        />
                    ) : (
                        <li className="flex items-center gap-3 py-3">
                            <KindIcon kind="EMAIL" />
                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground">No email on file — reset links and the email backup have nowhere to go.</p>
                            </div>
                        </li>
                    )}
                    {contacts.contacts.map((contact) => (
                        <li key={contact.id} className="flex items-center gap-3 py-3">
                            <KindIcon kind={contact.kind} />
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-sm font-medium text-foreground">{contact.value}</p>
                                    {contact.label && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{contact.label}</span>
                                    )}
                                    {contact.verifiedAt ? (
                                        <StatusBadge status={{ label: "Verified", tone: "success" }} />
                                    ) : (
                                        <StatusBadge status={{ label: "Unverified", tone: "warning" }} />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {CONTACT_KIND_LABEL[contact.kind]} · added {formatDateTime(contact.createdAt)}
                                    {contact.addedBy.name ? ` by ${contact.addedBy.name}` : ""}
                                    {contact.verifiedAt ? ` · verified ${formatDateTime(contact.verifiedAt)}` : ""}
                                </p>
                            </div>
                            {!closed && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 bg-card" disabled={sending === contact.id}>
                                            {sending === contact.id ? "Sending…" : "Actions"}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {!contact.verifiedAt && (
                                            <>
                                                <DropdownMenuItem onSelect={() => void sendCode(contact)}>Send code</DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setAsk({ kind: "verify", contact })}>Verify with a code</DropdownMenuItem>
                                                <DropdownMenuItem onSelect={() => setAsk({ kind: "mark-verified", contact })}>Mark verified</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </>
                                        )}
                                        <DropdownMenuItem onSelect={() => setAsk({ kind: "make-primary", contact })}>Make primary</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setAsk({ kind: "remove", contact })}>
                                            Remove
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </li>
                    ))}
                    {contacts.contacts.length === 0 && (
                        <li className="py-3 text-sm text-muted-foreground">No other contacts. Add one to give the account a second number or address.</li>
                    )}
                </ul>
            )}

            <Dialog open={ask !== null} onOpenChange={(open) => !open && close()}>
                <DialogContent className="sm:max-w-md">
                    {ask?.kind === "add" && <AddContactForm userId={userId} onCancel={close} onDone={done} />}
                    {ask?.kind === "verify" && <VerifyForm userId={userId} contact={ask.contact} onCancel={close} onDone={done} />}
                    {ask?.kind === "mark-verified" && (
                        <ReasonForm
                            title={`Mark ${ask.contact.value} verified?`}
                            description={`No code is typed: this is the desk's word that ${name} owns it, written on the audit row with your reason.`}
                            confirmLabel="Mark verified"
                            onCancel={close}
                            onDone={done}
                            run={(reason) => usersService.markContactVerified(userId, ask.contact.id, reason)}
                            success={`${ask.contact.value} marked verified`}
                        />
                    )}
                    {ask?.kind === "make-primary" && (
                        <ReasonForm
                            title={`Make ${ask.contact.value} the primary ${ask.contact.kind === "PHONE" ? "mobile" : "email"}?`}
                            description={
                                ask.contact.kind === "PHONE"
                                    ? `${name} signs in with ${ask.contact.value} from now on; the current number drops down to a verified contact. Every session on the old number ends and the old number is told.${ask.contact.verifiedAt ? "" : " This contact is unverified — the audit row will say so."}`
                                    : `Reset links and the email backup go to ${ask.contact.value} from now on; the current address drops down to a verified contact.${ask.contact.verifiedAt ? "" : " This contact is unverified — the audit row will say so."}`
                            }
                            confirmLabel="Make primary"
                            destructive={ask.contact.kind === "PHONE"}
                            onCancel={close}
                            onDone={done}
                            run={(reason) => usersService.makeContactPrimary(userId, ask.contact.id, reason)}
                            success={(result) =>
                                result.sessionsRevoked
                                    ? `Sign-in moved to ${result.after} — every session ended`
                                    : `Primary email is now ${result.after}`
                            }
                        />
                    )}
                    {ask?.kind === "remove" && (
                        <ReasonForm
                            title={`Remove ${ask.contact.value}?`}
                            description="The row goes; what it was is written on the audit row with your reason. The primary pair is untouched."
                            confirmLabel="Remove"
                            destructive
                            onCancel={close}
                            onDone={done}
                            run={(reason) => usersService.removeContact(userId, ask.contact.id, reason)}
                            success={`${ask.contact.value} removed`}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </SectionCard>
    );
}

function KindIcon({ kind }: { kind: ContactKind }) {
    const Icon = kind === "PHONE" ? Phone : Mail;
    return (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4 text-muted-foreground" />
        </span>
    );
}

function PrimaryRow({ kind, value, verified, detail }: { kind: ContactKind; value: string; verified: boolean; detail: string }) {
    return (
        <li className="flex items-center gap-3 py-3">
            <KindIcon kind={kind} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{value}</p>
                    <StatusBadge status={{ label: "PRIMARY", tone: "info" }} />
                    {verified && (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                            <BadgeCheck className="size-3.5" />
                            Verified
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {kind === "PHONE" ? "Sign-in identity" : "Reset links and the email backup"} · {detail}
                </p>
            </div>
        </li>
    );
}

/* ---- Add ---------------------------------------------------------- */

function AddContactForm({ userId, onCancel, onDone }: { userId: string; onCancel: () => void; onDone: () => void }) {
    const [kind, setKind] = React.useState<ContactKind>("PHONE");
    const [value, setValue] = React.useState("");
    const [label, setLabel] = React.useState("");
    const [reason, setReason] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!value.trim()) {
            setError(kind === "PHONE" ? "Enter the number." : "Enter the address.");
            return;
        }
        if (reason.trim().length < USER_REASON_MIN) {
            setError(`Say why this contact is being added — at least ${USER_REASON_MIN} characters.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const row = await usersService.addContact(userId, { kind, value, label, reason });
            toast.success(`${row.value} added`, { description: "Unverified until a code is answered or the desk marks it." });
            onDone();
        } catch (caught) {
            const taken = contactTakenOf(caught);
            setError(taken ? contactTakenMessage(taken) : message(caught, "Could not add the contact."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>Add a contact</DialogTitle>
                <DialogDescription>
                    A second number or address the account answers to. One value belongs to one account across the whole platform.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <RadioGroup value={kind} onValueChange={(next) => setKind(next as ContactKind)} className="grid grid-cols-2 gap-2">
                    {(["PHONE", "EMAIL"] as const).map((option) => (
                        <label key={option} className="flex items-center gap-2.5 rounded-md border px-3 py-2.5">
                            <RadioGroupItem value={option} />
                            <span className="text-sm font-medium text-foreground">{CONTACT_KIND_LABEL[option]}</span>
                        </label>
                    ))}
                </RadioGroup>
                <div className="grid gap-1.5">
                    <Label htmlFor="contact-value">{kind === "PHONE" ? "Mobile number" : "Email address"}</Label>
                    <Input
                        id="contact-value"
                        type={kind === "PHONE" ? "tel" : "email"}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={kind === "PHONE" ? "+91 98450 12345" : "name@example.in"}
                        autoComplete="off"
                        autoFocus
                    />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="contact-label">Label (optional)</Label>
                    <Input id="contact-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Office, accounts, spouse…" maxLength={60} autoComplete="off" />
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="contact-reason">Reason</Label>
                    <Textarea
                        id="contact-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        maxLength={USER_REASON_MAX}
                        placeholder="Owner asked on ticket #… to add the office line."
                    />
                    <p className="text-xs text-muted-foreground">At least {USER_REASON_MIN} characters; written on the audit row.</p>
                </div>
                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Adding…" : "Add contact"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ---- Verify ------------------------------------------------------- */

function VerifyForm({ userId, contact, onCancel, onDone }: { userId: string; contact: WireContact; onCancel: () => void; onDone: () => void }) {
    const [code, setCode] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (code.trim().length < 4) {
            setError("Enter the code they read back.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await usersService.verifyContact(userId, contact.id, code);
            toast.success(`${contact.value} verified`);
            onDone();
        } catch (caught) {
            setError(message(caught, "Could not verify the contact."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>Verify {contact.value}</DialogTitle>
                <DialogDescription>
                    Type the code the person reads back to you. If none has gone out yet, close this and use Send code first.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="contact-code">Code</Label>
                    <Input
                        id="contact-code"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        inputMode="numeric"
                        maxLength={12}
                        autoComplete="one-time-code"
                        autoFocus
                    />
                </div>
                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                    {submitting ? "Checking…" : "Verify"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ---- The reason forms --------------------------------------------- */

function ReasonForm<T>({
    title,
    description,
    confirmLabel,
    destructive,
    onCancel,
    onDone,
    run,
    success,
}: {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    onCancel: () => void;
    onDone: () => void;
    run: (reason: string) => Promise<T>;
    success: string | ((result: T) => string);
}) {
    const [reason, setReason] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (reason.trim().length < USER_REASON_MIN) {
            setError(`Say why — at least ${USER_REASON_MIN} characters.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const result = await run(reason.trim());
            toast.success(typeof success === "function" ? success(result) : success);
            onDone();
        } catch (caught) {
            const taken = contactTakenOf(caught);
            setError(taken ? contactTakenMessage(taken) : message(caught, "The change did not go through."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={USER_REASON_MAX} autoFocus />
                    <p className="text-xs text-muted-foreground">At least {USER_REASON_MIN} characters; written on the audit row.</p>
                </div>
                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={submitting}>
                    {submitting ? "Working…" : confirmLabel}
                </Button>
            </DialogFooter>
        </form>
    );
}
