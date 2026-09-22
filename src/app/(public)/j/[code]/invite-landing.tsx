"use client";

import * as React from "react";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
    landingBlocks,
    landingService,
    PROPOSAL_KIND_LABEL,
    proposalLine,
    type LandingPayload,
    type LandingVerifyResult,
    type LeadProposal,
} from "@/services/leads";

/**
 * LH7 (D6): the invite landing — `adx.in/j/<code>`.
 *
 * Mobile-first, both themes, no session: the page reads the code's payload
 * anonymously and offers the doors the brief names — the OTP that opens
 * the account on the lead's side and converts the lead through the link,
 * a callback, a slot, and the proposals with Accept. It styles itself
 * (scoped tokens under `.j-page`, dark under `prefers-color-scheme`) so it
 * owes nothing to the console's chrome, and it offers the app's deep link
 * (`adx://join/<code>`) where a phone has it installed.
 */

/** The page's own tokens — light by default, dark when the phone prefers it. */
const STYLE = `
.j-page{--j-bg:#faf8f5;--j-card:#ffffff;--j-ink:#1c1917;--j-muted:#6b6560;--j-line:#e7e2dc;--j-accent:#8d0b0c;--j-accent-ink:#ffffff;--j-soft:#f6e9e9;--j-ok:#166534;--j-ok-soft:#e8f5ec;
  min-height:100vh;background:var(--j-bg);color:var(--j-ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme: dark){.j-page{--j-bg:#141210;--j-card:#1f1c19;--j-ink:#f3efe9;--j-muted:#a39d95;--j-line:#33302b;--j-accent:#e5484d;--j-accent-ink:#141210;--j-soft:#2a1d1d;--j-ok:#7fd39a;--j-ok-soft:#1c2a20}}
.j-wrap{max-width:32rem;margin:0 auto;padding:1.25rem 1rem 4rem}
.j-brand{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.25rem 0 1rem}
.j-mark{font-weight:800;letter-spacing:-.02em;font-size:1.25rem;color:var(--j-accent)}
.j-eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--j-muted)}
.j-h1{font-size:1.75rem;line-height:1.15;font-weight:800;letter-spacing:-.02em;margin:.25rem 0 .5rem;text-wrap:balance}
.j-lede{font-size:1rem;line-height:1.5;color:var(--j-muted);margin:0 0 1rem}
.j-bullets{margin:0 0 1.25rem;padding:0;list-style:none;display:grid;gap:.4rem}
.j-bullets li{display:flex;gap:.5rem;align-items:flex-start;font-size:.95rem;line-height:1.4}
.j-bullets li::before{content:"";flex:0 0 .5rem;height:.5rem;margin-top:.45rem;border-radius:999px;background:var(--j-accent)}
.j-card{background:var(--j-card);border:1px solid var(--j-line);border-radius:14px;padding:1rem;margin:0 0 .75rem}
.j-card h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--j-muted);margin:0 0 .5rem;font-weight:600}
.j-big{font-size:1.35rem;font-weight:700;letter-spacing:-.01em;margin:0 0 .25rem}
.j-line{font-size:.95rem;line-height:1.45;margin:.15rem 0}
.j-muted{color:var(--j-muted);font-size:.85rem}
.j-btn{appearance:none;border:0;border-radius:12px;padding:.85rem 1rem;font-size:1rem;font-weight:700;width:100%;cursor:pointer;background:var(--j-accent);color:var(--j-accent-ink)}
.j-btn:disabled{opacity:.55;cursor:default}
.j-btn.ghost{background:transparent;color:var(--j-ink);border:1px solid var(--j-line)}
.j-btn.small{width:auto;padding:.5rem .8rem;font-size:.85rem;border-radius:10px}
.j-field{display:grid;gap:.35rem;margin:0 0 .75rem}
.j-field label{font-size:.85rem;font-weight:600}
.j-field input,.j-field select,.j-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--j-line);border-radius:10px;padding:.7rem .8rem;font-size:1rem;background:var(--j-bg);color:var(--j-ink)}
.j-field input:focus,.j-field select:focus,.j-field textarea:focus{outline:2px solid var(--j-accent);outline-offset:1px}
.j-row{display:flex;gap:.5rem;flex-wrap:wrap}
.j-ok{background:var(--j-ok-soft);color:var(--j-ok);border-radius:12px;padding:.85rem 1rem;font-weight:600}
.j-warn{background:var(--j-soft);border-radius:12px;padding:.85rem 1rem}
.j-pill{display:inline-block;border-radius:999px;padding:.15rem .6rem;font-size:.75rem;font-weight:600;background:var(--j-soft);color:var(--j-accent)}
.j-prop{border-top:1px solid var(--j-line);padding:.6rem 0}
.j-prop:first-of-type{border-top:0;padding-top:0}
.j-foot{margin-top:1.5rem;font-size:.8rem;color:var(--j-muted);text-align:center}
`;

type Stage = "IDLE" | "OTP_SENT" | "DONE";

export function InviteLanding({ code }: { code: string }) {
    const [page, setPage] = React.useState<LandingPayload | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [reloadKey, setReloadKey] = React.useState(0);

    React.useEffect(() => {
        let alive = true;
        landingService
            .get(code)
            .then((data) => {
                if (alive) setPage(data);
            })
            .catch((cause: unknown) => {
                if (alive) setError(cause instanceof ApiError && cause.status === 404 ? "This link does not open anything. Check it with the person who sent it." : cause instanceof Error ? cause.message : "Could not reach ADX.");
            });
        return () => {
            alive = false;
        };
    }, [code, reloadKey]);

    return (
        <div className="j-page" data-testid="invite-landing">
            <style>{STYLE}</style>
            <div className="j-wrap">
                <header className="j-brand">
                    <span className="j-mark">ADX</span>
                    {page ? <span className="j-eyebrow">Invitation · {page.business.city ?? "India"}</span> : null}
                </header>
                {error ? (
                    <div className="j-warn" role="alert" data-testid="landing-error">
                        {error}
                    </div>
                ) : !page ? (
                    <p className="j-muted">Opening your invitation…</p>
                ) : (
                    <LandingBody page={page} code={code} onChanged={() => setReloadKey((k) => k + 1)} />
                )}
                <p className="j-foot">ADX · out-of-home advertising, street by street. This link is private to {page?.business.name ?? "you"}.</p>
            </div>
        </div>
    );
}

function LandingBody({ page, code, onChanged }: { page: LandingPayload; code: string; onChanged: () => void }) {
    const shut = page.state === "EXPIRED" || page.state === "REVOKED";
    const blocks = landingBlocks(page);
    return (
        <>
            <p className="j-eyebrow" data-testid="landing-business">
                For {page.business.name}
                {page.agent?.name ? ` · from ${page.agent.name}, your ADX contact` : ""}
            </p>
            <h1 className="j-h1" data-testid="landing-headline">
                {page.copy.headline}
            </h1>
            {page.copy.line ? <p className="j-lede">{page.copy.line}</p> : null}
            {page.copy.bullets.length ? (
                <ul className="j-bullets">
                    {page.copy.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                    ))}
                </ul>
            ) : null}

            {shut ? (
                <div className="j-warn" data-testid="landing-shut">
                    {page.state === "EXPIRED" ? "This link has run its thirty days." : "This link was replaced by a newer one."} Ask {page.agent?.name ?? "your ADX contact"} for a fresh link — or ask for a call back below.
                </div>
            ) : null}

            {blocks.map((block) => (
                <section key={block.key} className="j-card" data-testid={`landing-block-${block.key}`}>
                    <h2>{block.label}</h2>
                    {block.key === "PROPOSALS" ? (
                        <Proposals code={code} proposals={page.proposals} onChanged={onChanged} />
                    ) : (
                        block.lines.map((line, index) => (
                            <p key={line} className={index === 0 ? "j-big" : "j-line"}>
                                {line}
                            </p>
                        ))
                    )}
                </section>
            ))}

            {page.converted ? (
                <section className="j-card" data-testid="landing-converted">
                    <div className="j-ok">You already have an ADX account for {page.business.name}.</div>
                    <p className="j-muted" style={{ marginTop: ".6rem" }}>Sign in on the app with your number to carry on.</p>
                    <a className="j-btn" style={{ display: "block", textAlign: "center", marginTop: ".6rem", textDecoration: "none" }} href={page.appLink}>
                        Open the ADX app
                    </a>
                </section>
            ) : !shut ? (
                <OtpDoor code={code} page={page} />
            ) : null}

            <AskDoors code={code} shut={shut} />
        </>
    );
}

function Proposals({ code, proposals, onChanged }: { code: string; proposals: LeadProposal[]; onChanged: () => void }) {
    const [busy, setBusy] = React.useState<string | null>(null);
    if (proposals.length === 0) return <p className="j-muted">Nothing sent yet — your ADX contact adds a figure here.</p>;
    return (
        <div>
            {proposals.map((proposal) => (
                <div key={proposal.id} className="j-prop" data-testid={`landing-proposal-${proposal.id}`}>
                    <p className="j-muted">
                        {PROPOSAL_KIND_LABEL[proposal.kind]} · {formatDateTime(proposal.sentAt)}
                    </p>
                    <p className="j-big">{proposalLine(proposal)}</p>
                    {proposal.note ? <p className="j-line">{proposal.note}</p> : null}
                    {proposal.acceptedAt ? (
                        <span className="j-pill">Accepted</span>
                    ) : (
                        <button
                            type="button"
                            className="j-btn small"
                            disabled={busy === proposal.id}
                            onClick={() => {
                                setBusy(proposal.id);
                                landingService
                                    .accept(code, proposal.id)
                                    .then(() => onChanged())
                                    .catch(() => undefined)
                                    .finally(() => setBusy(null));
                            }}
                            data-testid={`landing-accept-${proposal.id}`}
                        >
                            {busy === proposal.id ? "Sending…" : "Accept this"}
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

/** The mobile, the code, the name — and the account is open on the lead's side. */
function OtpDoor({ code, page }: { code: string; page: LandingPayload }) {
    const [stage, setStage] = React.useState<Stage>("IDLE");
    const [mobile, setMobile] = React.useState("");
    const [otp, setOtp] = React.useState("");
    const [name, setName] = React.useState(page.business.contactName ?? "");
    const [busy, setBusy] = React.useState(false);
    const [problem, setProblem] = React.useState<string | null>(null);
    const [done, setDone] = React.useState<LandingVerifyResult | null>(null);

    async function sendCode() {
        setProblem(null);
        if (mobile.replace(/\D/g, "").length < 10) {
            setProblem("Type the mobile number you use.");
            return;
        }
        setBusy(true);
        try {
            await landingService.otp(code, mobile);
            setStage("OTP_SENT");
        } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : "Could not send the code.");
        } finally {
            setBusy(false);
        }
    }

    async function verify() {
        setProblem(null);
        if (otp.trim().length < 4) {
            setProblem("Type the code from the SMS.");
            return;
        }
        setBusy(true);
        try {
            const result = await landingService.verify(code, { mobile, otp: otp.trim(), ...(name.trim() ? { name: name.trim() } : {}), accountType: "BUSINESS" });
            setDone(result);
            setStage("DONE");
        } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : "That code did not work.");
        } finally {
            setBusy(false);
        }
    }

    if (stage === "DONE" && done) {
        return (
            <section className="j-card" data-testid="landing-done">
                <div className="j-ok">You&apos;re in — {page.business.name} is on ADX{done.party.displayId ? ` as ${done.party.displayId}` : ""}.</div>
                <p className="j-line" style={{ marginTop: ".6rem" }}>
                    {page.agent?.name ?? "Your ADX contact"} will take it from here. The app is where the rest happens — the same number signs you in.
                </p>
                <a className="j-btn" style={{ display: "block", textAlign: "center", marginTop: ".6rem", textDecoration: "none" }} href={done.appLink} data-testid="landing-open-app">
                    Open the ADX app
                </a>
            </section>
        );
    }

    return (
        <section className="j-card" data-testid="landing-otp">
            <h2>{page.copy.cta}</h2>
            {stage === "IDLE" ? (
                <>
                    <div className="j-field">
                        <label htmlFor="j-mobile">Your mobile number</label>
                        <input id="j-mobile" inputMode="tel" autoComplete="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} placeholder="98765 43210" data-testid="landing-mobile" />
                    </div>
                    <button type="button" className="j-btn" disabled={busy} onClick={() => void sendCode()} data-testid="landing-send-otp">
                        {busy ? "Sending…" : "Send me a code"}
                    </button>
                    <p className="j-muted" style={{ marginTop: ".5rem" }}>One SMS, no password. By continuing you agree to ADX&apos;s terms.</p>
                </>
            ) : (
                <>
                    <p className="j-muted">We sent a code to {mobile}.</p>
                    <div className="j-field">
                        <label htmlFor="j-otp">The code</label>
                        <input id="j-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="123456" data-testid="landing-otp-code" />
                    </div>
                    <div className="j-field">
                        <label htmlFor="j-name">Your name</label>
                        <input id="j-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ravi Sharma" />
                    </div>
                    <button type="button" className="j-btn" disabled={busy} onClick={() => void verify()} data-testid="landing-verify">
                        {busy ? "Checking…" : "Verify and continue"}
                    </button>
                    <button type="button" className="j-btn ghost" style={{ marginTop: ".5rem" }} disabled={busy} onClick={() => setStage("IDLE")}>
                        Change the number
                    </button>
                </>
            )}
            {problem ? (
                <p className="j-warn" style={{ marginTop: ".6rem" }} role="alert" data-testid="landing-problem">
                    {problem}
                </p>
            ) : null}
        </section>
    );
}

/** A call back, or a slot: a visit at the business or a call, at a time they pick. */
function AskDoors({ code, shut }: { code: string; shut: boolean }) {
    const [open, setOpen] = React.useState<"CALLBACK" | "SLOT" | null>(null);
    const [note, setNote] = React.useState("");
    const [at, setAt] = React.useState("");
    const [kind, setKind] = React.useState<"VISIT" | "CALL">("VISIT");
    const [busy, setBusy] = React.useState(false);
    const [done, setDone] = React.useState<string | null>(null);
    const [problem, setProblem] = React.useState<string | null>(null);

    async function callback() {
        setBusy(true);
        setProblem(null);
        try {
            await landingService.callback(code, note.trim() ? { note: note.trim() } : {});
            setDone("Done — someone from ADX will call you back within a few hours.");
        } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : "Could not ask for a call.");
        } finally {
            setBusy(false);
        }
    }

    async function slot() {
        if (!at) {
            setProblem("Pick a day and a time.");
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            const result = await landingService.slot(code, { at: new Date(at).toISOString(), kind, ...(note.trim() ? { note: note.trim() } : {}) });
            setDone(result.kind === "VISIT" ? `Booked — ${formatDateTime(result.at)}. Your ADX contact confirms the visit shortly.` : `Noted — a call at ${formatDateTime(result.at)}.`);
        } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : "Could not book the slot.");
        } finally {
            setBusy(false);
        }
    }

    if (done) {
        return (
            <section className="j-card" data-testid="landing-ask-done">
                <div className="j-ok">{done}</div>
            </section>
        );
    }

    return (
        <section className="j-card" data-testid="landing-ask">
            <h2>{shut ? "Still interested?" : "Prefer to talk first?"}</h2>
            <div className="j-row">
                <button type="button" className={`j-btn small${open === "CALLBACK" ? "" : " ghost"}`} onClick={() => setOpen(open === "CALLBACK" ? null : "CALLBACK")} data-testid="landing-ask-callback">
                    Call me back
                </button>
                {!shut ? (
                    <button type="button" className={`j-btn small${open === "SLOT" ? "" : " ghost"}`} onClick={() => setOpen(open === "SLOT" ? null : "SLOT")} data-testid="landing-ask-slot">
                        Pick a time
                    </button>
                ) : null}
            </div>
            {open === "SLOT" ? (
                <div style={{ marginTop: ".75rem" }}>
                    <div className="j-field">
                        <label htmlFor="j-at">When</label>
                        <input id="j-at" type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} data-testid="landing-slot-at" />
                    </div>
                    <div className="j-field">
                        <label htmlFor="j-kind">What suits</label>
                        <select id="j-kind" value={kind} onChange={(event) => setKind(event.target.value as "VISIT" | "CALL")}>
                            <option value="VISIT">A visit at my place</option>
                            <option value="CALL">A phone call</option>
                        </select>
                    </div>
                </div>
            ) : null}
            {open ? (
                <div style={{ marginTop: ".5rem" }}>
                    <div className="j-field">
                        <label htmlFor="j-note">Anything to add (optional)</label>
                        <textarea id="j-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="After 6 pm works best" />
                    </div>
                    <button type="button" className="j-btn" disabled={busy} onClick={() => void (open === "CALLBACK" ? callback() : slot())} data-testid="landing-ask-send">
                        {busy ? "Sending…" : open === "CALLBACK" ? "Ask for a call" : "Book it"}
                    </button>
                </div>
            ) : null}
            {problem ? (
                <p className="j-warn" style={{ marginTop: ".6rem" }} role="alert">
                    {problem}
                </p>
            ) : null}
        </section>
    );
}
