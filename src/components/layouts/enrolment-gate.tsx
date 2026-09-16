"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AuthenticatorSetup } from "@/components/adx/authenticator-setup";
import { onEnrolmentRequired, tokens } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { mustEnrolAuthenticatorOf } from "@/lib/jwt";

/**
 * The enrolment gate (Lot K2).
 *
 * When the platform requires an authenticator app of every admin and this
 * one has none, the session earned with an SMS or email code carries
 * `mustEnrolAuthenticator`, and the backend answers 403
 * TOTP_ENROLMENT_REQUIRED on every route but the enrolment ones. Two
 * things open this: the claim on the stored token when the shell mounts,
 * and any such 403 reported by the API client — the same signal whether
 * the operator arrived by sign-in, by a reload or by a refresh that
 * re-decided the claim.
 *
 * It is a dialog that will not close. The X, the overlay and Escape all
 * land in `onOpenChange`, which is ignored; the one way out short of
 * finishing the setup is Sign out. Once the codes are acknowledged the
 * confirm has already stored the fresh access token without the claim,
 * and the page reloads so every screen that was refused reads again.
 */
/** The stored token is read at render, not subscribed to: the confirm that replaces it is followed by a reload. */
const noSubscription = () => () => {};

export function EnrolmentGate() {
    const { signOut } = useAuth();
    /* The claim on the token — false on the server render, where there is no token to read. */
    const claimed = React.useSyncExternalStore(noSubscription, () => mustEnrolAuthenticatorOf(tokens.access), () => false);
    /* A refusal the API client reported since the shell mounted. */
    const [refused, setRefused] = React.useState(false);
    React.useEffect(() => onEnrolmentRequired(() => setRefused(true)), []);

    const required = claimed || refused;

    const done = () => {
        setRefused(false);
        toast.success("Authenticator app set up", { description: "Your next sign-in asks for the app's code." });
        window.location.reload();
    };

    return (
        <Dialog open={required} onOpenChange={() => undefined}>
            <DialogContent
                className="sm:max-w-lg [&>button:last-child]:hidden"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Set up an authenticator app to continue</DialogTitle>
                    <DialogDescription>
                        This console requires an authenticator app of every admin. Nothing else opens until yours is set up; it takes a
                        minute.
                    </DialogDescription>
                </DialogHeader>
                {required && <AuthenticatorSetup onDone={done} />}
                <div className="flex justify-start border-t pt-3">
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => void signOut()}>
                        Sign out instead
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
