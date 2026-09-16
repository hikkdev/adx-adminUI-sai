import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EmailDoorVerdict, EmailSettings, ResendSettings } from "@/services/integrations";

/**
 * AE-C — the Email card made testable.
 *
 * What this pins: the SMTP door's mode control writes
 * `PUT /integrations { section: 'email', patch: { mode } }` and nothing
 * else; under Ethereal the card says the inbox sentence with the login
 * name the read carried and links to ethereal.email, and under SMTP the
 * Gmail recipe stands under the form; "Send test email" opens a dialog
 * prefilled with the operator's address, posts
 * `POST /integrations/email/test { to }`, and prints the verdict as the
 * backend answered it — sent with a preview link (Ethereal), sent without
 * one (SMTP), or refused with the vendor's sentence; and the button is
 * disabled with the reason while the door in force has nothing to send
 * with.
 */

const { backend, toast } = vi.hoisted(() => {
    const toast = { success: vi.fn(), error: vi.fn() };
    const backend = {
        calls: [] as { method: string; path: string; body?: unknown }[],
        answer: {} as unknown,
        failure: null as Error | null,
        reset() {
            this.calls = [];
            this.answer = {};
            this.failure = null;
        },
    };
    return { backend, toast };
});

vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/api-config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-config")>();
    return { ...actual, apiConfig: { ...actual.apiConfig, live: true }, isLive: () => true };
});

vi.mock("@/lib/api-client", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-client")>();
    const wrap = async (method: string, path: string, body?: unknown) => {
        backend.calls.push({ method, path, body });
        if (backend.failure) throw backend.failure;
        return backend.answer;
    };
    return {
        ...actual,
        api: {
            get: (path: string) => wrap("GET", path),
            post: (path: string, body?: unknown) => wrap("POST", path, body),
            patch: (path: string, body?: unknown) => wrap("PATCH", path, body),
            put: (path: string, body?: unknown) => wrap("PUT", path, body),
            delete: (path: string) => wrap("DELETE", path),
        },
    };
});

import { EMAIL_DOOR_LABEL } from "@/services/integrations";
import { ETHEREAL_SENTENCE, EmailModeControl, EmailTestControl, GMAIL_HELPER } from "./email-door";

/** The email section as `GET /integrations` answers it on an AE-B backend. */
const email = (over: Partial<EmailSettings> = {}): EmailSettings => ({
    host: null,
    port: null,
    user: null,
    password: null,
    from: null,
    primary: null,
    mode: "SMTP",
    ...over,
});

const resend = (over: Partial<ResendSettings> = {}): ResendSettings => ({ apiKey: null, fromEmail: null, ...over });

const verdict = (over: Partial<EmailDoorVerdict> = {}): EmailDoorVerdict => ({
    provider: "SMTP",
    configured: true,
    ok: true,
    messageId: "<abc@adx.in>",
    previewUrl: null,
    response: "250 2.0.0 OK",
    message: "Sent via SMTP (smtp.gmail.com:587) from ADX <no-reply@adx.in>.",
    ...over,
});

beforeEach(() => {
    backend.reset();
    toast.success.mockReset();
    toast.error.mockReset();
});

describe("the mode control", () => {
    it("writes the mode alone as the email section's patch and re-reads", async () => {
        const onChanged = vi.fn();
        render(<EmailModeControl email={email({ host: "smtp.gmail.com" })} onChanged={onChanged} />);

        const group = screen.getByRole("radiogroup", { name: "SMTP mode" });
        expect(within(group).getByRole("radio", { name: "SMTP server" })).toHaveAttribute("aria-checked", "true");
        expect(within(group).getByRole("radio", { name: "Ethereal test inbox" })).toHaveAttribute("aria-checked", "false");

        fireEvent.click(within(group).getByRole("radio", { name: "Ethereal test inbox" }));

        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        expect(backend.calls).toEqual([{ method: "PUT", path: "/integrations", body: { section: "email", patch: { mode: "ETHEREAL" } } }]);
        expect(toast.success).toHaveBeenCalledWith("Email goes to the Ethereal test inbox", expect.anything());
    });

    it("does nothing when the mode in force is clicked again", () => {
        render(<EmailModeControl email={email()} onChanged={vi.fn()} />);
        fireEvent.click(screen.getByRole("radio", { name: "SMTP server" }));
        expect(backend.calls).toEqual([]);
    });

    it("under SMTP prints the Gmail recipe under the form", () => {
        render(<EmailModeControl email={email()} onChanged={vi.fn()} />);
        expect(screen.getByText(GMAIL_HELPER)).toBeInTheDocument();
        expect(screen.queryByText(ETHEREAL_SENTENCE)).not.toBeInTheDocument();
    });

    it("under Ethereal says the inbox sentence with the login name the read carried and links to ethereal.email", () => {
        render(
            <EmailModeControl
                email={email({ mode: "ETHEREAL", ethereal: { user: "kaya.hoppe12@ethereal.email", webUrl: "https://ethereal.email/login" } })}
                onChanged={vi.fn()}
            />,
        );
        expect(screen.getByRole("radio", { name: "Ethereal test inbox" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText(ETHEREAL_SENTENCE)).toBeInTheDocument();
        expect(screen.getByText("kaya.hoppe12@ethereal.email")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open the Ethereal inbox/ })).toHaveAttribute("href", "https://ethereal.email/login");
        expect(screen.queryByText(GMAIL_HELPER)).not.toBeInTheDocument();
    });

    it("under Ethereal before any send says no inbox exists yet", () => {
        render(<EmailModeControl email={email({ mode: "ETHEREAL", ethereal: { user: null, webUrl: "https://ethereal.email/login" } })} onChanged={vi.fn()} />);
        expect(screen.getByText(/none yet/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Open the Ethereal inbox/ })).toHaveAttribute("href", "https://ethereal.email/login");
    });

    it("reads an older backend's section, which carries no mode, as SMTP", () => {
        const { mode: _mode, ...older } = email();
        void _mode;
        render(<EmailModeControl email={older as EmailSettings} onChanged={vi.fn()} />);
        expect(screen.getByRole("radio", { name: "SMTP server" })).toHaveAttribute("aria-checked", "true");
    });
});

describe("the test email", () => {
    const sendTo = async (to?: string) => {
        fireEvent.click(screen.getByRole("button", { name: "Send test email" }));
        const dialog = await screen.findByRole("dialog");
        const field = within(dialog).getByLabelText("To");
        if (to !== undefined) fireEvent.change(field, { target: { value: to } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        return dialog;
    };

    it("opens a dialog prefilled with the operator's address and posts { to } to the email test route", async () => {
        backend.answer = verdict();
        render(<EmailTestControl settings={{ email: email({ host: "smtp.gmail.com" }), resend: resend() }} operatorEmail="priya@adx.test" />);

        fireEvent.click(screen.getByRole("button", { name: "Send test email" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText("To")).toHaveValue("priya@adx.test");
        fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        await waitFor(() => expect(screen.getByTestId("email-test-verdict")).toBeInTheDocument());
        expect(backend.calls).toEqual([{ method: "POST", path: "/integrations/email/test", body: { to: "priya@adx.test" } }]);
    });

    it("starts blank without a session address and will not send until the address is one", async () => {
        render(<EmailTestControl settings={{ email: email({ host: "smtp.gmail.com" }), resend: resend() }} />);
        fireEvent.click(screen.getByRole("button", { name: "Send test email" }));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByLabelText("To")).toHaveValue("");
        expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "not an address" } });
        expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "ops@adx.in" } });
        expect(within(dialog).getByRole("button", { name: "Send" })).toBeEnabled();
    });

    it("prints an Ethereal verdict: sent, the door, the id and the Open preview link", async () => {
        backend.answer = verdict({
            provider: "ETHEREAL",
            messageId: "<eth1@adx.in>",
            previewUrl: "https://ethereal.email/message/Zt1.abc",
            response: "250 Accepted [STATUS=new MSGID=Zt1.abc]",
            message: "Sent to the Ethereal test inbox - nothing was delivered; open the preview link to read it.",
        });
        render(<EmailTestControl settings={{ email: email({ mode: "ETHEREAL" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        await sendTo();

        const panel = await screen.findByTestId("email-test-verdict");
        expect(within(panel).getByText("Sent")).toBeInTheDocument();
        expect(within(panel).getByText(`via ${EMAIL_DOOR_LABEL.ETHEREAL}`)).toBeInTheDocument();
        expect(within(panel).getByText(/nothing was delivered/)).toBeInTheDocument();
        expect(within(panel).getByText("<eth1@adx.in>")).toBeInTheDocument();
        expect(within(panel).getByRole("link", { name: /Open preview/ })).toHaveAttribute("href", "https://ethereal.email/message/Zt1.abc");
        /* The dialog closed on the answer; the verdict stays on the card. */
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("prints an SMTP verdict: sent, the id, no preview link", async () => {
        backend.answer = verdict();
        render(<EmailTestControl settings={{ email: email({ host: "smtp.gmail.com" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        await sendTo();

        const panel = await screen.findByTestId("email-test-verdict");
        expect(within(panel).getByText("Sent")).toBeInTheDocument();
        expect(within(panel).getByText("via SMTP")).toBeInTheDocument();
        expect(within(panel).getByText(/Sent via SMTP \(smtp\.gmail\.com:587\)/)).toBeInTheDocument();
        expect(within(panel).getByText("<abc@adx.in>")).toBeInTheDocument();
        expect(within(panel).getByText("250 2.0.0 OK")).toBeInTheDocument();
        expect(within(panel).queryByRole("link", { name: /Open preview/ })).not.toBeInTheDocument();
    });

    it("prints a refusal: not ok, the vendor's sentence, no id and no link", async () => {
        backend.answer = verdict({
            ok: false,
            messageId: null,
            response: null,
            message: "Invalid login: 535-5.7.8 Username and Password not accepted.",
        });
        render(<EmailTestControl settings={{ email: email({ host: "smtp.gmail.com" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        await sendTo();

        const panel = await screen.findByTestId("email-test-verdict");
        expect(within(panel).getByText("Refused")).toBeInTheDocument();
        expect(within(panel).getByText(/535-5\.7\.8 Username and Password not accepted/)).toBeInTheDocument();
        expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("sends to the address typed over the prefill", async () => {
        backend.answer = verdict();
        render(<EmailTestControl settings={{ email: email({ host: "smtp.gmail.com" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        await sendTo("  ops@adx.in ");
        await screen.findByTestId("email-test-verdict");
        expect(backend.calls[0].body).toEqual({ to: "ops@adx.in" });
    });

    it("is disabled with the reason while SMTP has no host and the mode is not Ethereal", () => {
        render(<EmailTestControl settings={{ email: email(), resend: resend() }} operatorEmail="priya@adx.test" />);
        expect(screen.getByRole("button", { name: "Send test email" })).toBeDisabled();
        expect(screen.getByText(/SMTP has no host on file/)).toBeInTheDocument();
    });

    it("is disabled with the reason while Resend is primary without a key", () => {
        render(<EmailTestControl settings={{ email: email({ primary: "RESEND" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        expect(screen.getByRole("button", { name: "Send test email" })).toBeDisabled();
        expect(screen.getByText(/Resend is the primary door but has no API key/)).toBeInTheDocument();
    });

    it("is enabled under Ethereal with no host, and names the door it will use", () => {
        render(<EmailTestControl settings={{ email: email({ mode: "ETHEREAL" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        expect(screen.getByRole("button", { name: "Send test email" })).toBeEnabled();
        expect(screen.getByText(EMAIL_DOOR_LABEL.ETHEREAL)).toBeInTheDocument();
    });

    it("says why when the route itself fails, and keeps the dialog open", async () => {
        backend.failure = new Error("Forbidden");
        render(<EmailTestControl settings={{ email: email({ host: "smtp.gmail.com" }), resend: resend() }} operatorEmail="priya@adx.test" />);
        await sendTo();
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Forbidden"));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.queryByTestId("email-test-verdict")).not.toBeInTheDocument();
    });
});
