/**
 * Backend wiring.
 *
 * Every domain reads the ADX backend; there are no seeded fixtures left
 * (CE4). Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at
 * the backend. With it off, every screen says so rather than improvising.
 */
export const apiConfig = {
    baseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1").replace(
        /\/$/,
        ""
    ),
    /** When false, auth and data calls resolve from fixtures. */
    live: process.env.NEXT_PUBLIC_USE_API === "true",
    /** Cloudflare Turnstile site key. Unset means the widget doesn't render — the
     *  backend's captcha check no-ops the same way when its secret key is unset. */
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    /** Google OAuth client ID. Unset hides the "Continue with Google" button.
     *  Must be the same value as the backend's GOOGLE_CLIENT_ID: that is the
     *  `aud` claim it pins, so a mismatch rejects every token. Unlike Turnstile
     *  the backend does *not* degrade to a no-op here — POST /auth/google
     *  answers 503 while its own copy is unset. */
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null,
} as const;

/**
 * Which domains the console actually reads from the API.
 *
 * `live` turns the API on; this says how far the migration off fixtures has
 * actually got. The two are not the same thing, and conflating them is a real
 * bug rather than a tidiness point.
 *
 * A HALF-MIGRATED DOMAIN IS WORSE THAN AN UNMIGRATED ONE. Fixture ids look like
 * `adv_001`; backend ids are cuids. The moment one screen takes an id from
 * fixtures and another calls the API with it, every one of those calls answers
 * 404 — which is exactly what the Wallet & brands tab did, because
 * `/advertisers/[id]` reads fixtures while the tab called the live endpoint.
 *
 * A domain flips to `true` here only once EVERY screen that shows its records
 * reads them from the API too — including the detail pages other screens link
 * into.
 *
 * The one legitimate way to satisfy that rule without an endpoint is to show
 * nothing. A section with no source renders empty and says why, which is what
 * `/publishers/[id]` does with payouts and what the advertiser page does with
 * campaigns and invoices. Empty is a true statement; a fixture next to a live
 * record is not.
 */
export const liveDomains = {
    /** Sign-in, session restore, sign-out. Fully migrated. */
    auth: true,

    /** Party identifier formats. No record ids cross this boundary — formats are
     *  keyed by party, and the backfill acts on rows the server already holds. */
    identifiers: true,

    /** Funnel, attempts, verification queue and compliance all read from the API
     *  and render ids the API gave them, and `/publishers/[id]` now resolves
     *  the publisher and its listings live too, so following a row through
     *  works. Payouts and admin activity on that page have no per-publisher
     *  endpoint yet and render empty in live mode rather than showing another
     *  publisher's figures. */
    supply: true,

    /** The list and the detail page read the API, and so do the funnel, the
     *  wallet and brands. Every advertiser id the console shows is one the API
     *  gave it, and following a row through works.
     *
     *  The Campaigns and Invoices tabs on the detail page read the API too —
     *  `/campaigns?advertiserId=` and, since Lot B gave `Invoice` a table,
     *  `/finance/invoices?advertiserId=`. Both used to be empty on purpose
     *  because there was nothing to read; rendering fixtures beside a real
     *  advertiser would have put another company's paper on their page.
     *
     *  Lot G (CG3, Q119): the Contact card's Industry row reads the row's
     *  `industry`, its Edit picker and Add advertiser's take the picklist
     *  `GET /advertisers/industries` serves and write through `PATCH
     *  /advertisers/:id` and `POST /advertisers`; the Account status tile's
     *  "Last activity" is the newest `at` on `GET /advertisers/:id/summary`'s
     *  feed. */
    advertisers: true,

    /** Orders read the API, and the console speaks the backend's fourteen-state
     *  `OrderStatus` rather than a vocabulary of its own. The list, the detail
     *  page, the pipeline board and the dashboard's assign card all read the
     *  same source, so an id from one opens in another. */
    orders: true,
    /** Agents. The roster, the detail page, the create dialog and both
     *  pickers read `GET /agents`; the console adopted the API's shape
     *  rather than translating into its own, and the columns that had no
     *  source (zone, rating, earnings, orders MTD) are gone, not zero-filled. */
    agents: true,

    /** The queue, a ticket and its replies. The assignment screen was already
     *  live on its own; it now shares this flag rather than standing apart,
     *  because the rest of support reads the same tickets. */
    support: true,

    /** The disputes desk: the queue, a case with its thread and evidence,
     *  the status moves, the decision and the credit release all read and
     *  write `/disputes`. The re-install a REINSTALL verdict raises and the
     *  fraud case a dispute cites ride on the same read. */
    disputes: true,

    /** Fraud cases — Lot D's case object under the disputes menu. The desk
     *  reads `/fraud/cases`, a file reads `/fraud/cases/:id` with its notes,
     *  evidence and the subject's standing, and every write goes to the
     *  same routes; a confirmation suspends the subject through the
     *  suspension module, with the case number as the reason.
     *
     *  The four seeded `FR-*` cases are gone rather than kept: their fraud
     *  score, link graph, shared signals and value at risk were fields no
     *  `FraudCase` had, and their statuses named moves the backend never
     *  had. Lot G (package CG2) gave the case the real ones: the score and
     *  its signals from `POST /fraud/cases/:id/score`, the link graph from
     *  `GET /fraud/cases/:id/linked`, ESCALATED from `POST …/escalate`, and
     *  the party pages' "Scan for signals" through `POST /fraud/scan`.
     *  Value at risk is still not served (the linked read carries no
     *  balances) and the tile says so. The subject link opens a party page
     *  under `listings`, `supply`, `advertisers` or `agents` above, all
     *  already true. With the API off the desk says so. */
    fraud: true,

    /** The engine screens read the API and nothing else — there are no engine
     *  fixtures to fall back to, on purpose. A comparable range invented from
     *  seed data would put a fabricated market rate in front of ops, and the
     *  whole claim of this subsystem is that its numbers come from somewhere
     *  real. With the API off these screens say so rather than improvising.
     *
     *  The rate-card screens under /pricing are a different, older thing and
     *  stay on fixtures until they are retired; they do not read this flag. */
    pricingEngine: true,

    /** The publisher KYC queue and its workbench read `/publishers/kyc-queue`
     *  and decide through `/publishers/:id/kyc/review`. Self-onboarded
     *  publishers — the ones DR 08 lets in with no agent — appear here, named
     *  as such. The advertiser tab reads `/advertiser-kyc`, the agents tab
     *  `/agent-kyc` and, since Lot D, the employees tab `/employee-kyc` under
     *  the same flag; four parties, one domain. The desk's per-document
     *  decisions, re-upload asks, assignment and liveness video are Lot D's
     *  routes on the same two queues, and every private document is fetched
     *  through `GET /files/:id` by `<PrivateFile>`. The intake under
     *  `/onboarding/submissions` — agents and employees approved into being
     *  — reads this flag too: it is the desk's front door. Lot G (CG2): the
     *  Escalated chip is `?escalated=true` on both queues, the Escalate
     *  button is `POST …/escalate { reason }` on both desks, and the SLA
     *  column reads `kyc.escalationSlaMultiplier` off `/settings/platform`.
     *
     *  The seeded `kyc_*` and `akyc_*` cases are gone rather than kept:
     *  their ids were never issued by the backend, and the risk flags,
     *  monthly spend and reviewer names they carried have no column. With
     *  the API off the four tabs say so. */
    kyc: true,

    /** The listings table and the listing page both read `/listings` — the
     *  table through the paged admin query, the detail page through
     *  `GET /listings/:id`, which did not exist until DR 06 needed it. The
     *  `lst_*` fixtures they used to draw are gone rather than kept as a
     *  fallback: their ids were never issued by the backend, so every row
     *  opened a record that did not exist, and a spot genuinely created through
     *  Add listing never appeared in the list at all.
     *
     *  The review desk, the attempts funnel and the verification queue under
     *  the same menu read `/supply` and were already live. */
    listings: true,

    /** Leads — DR 06's desk. `/leads` for the page, `PATCH /leads/:id` for the
     *  two writes on a row.
     *
     *  Honest for the simplest reason available: there are no lead fixtures at
     *  all, and never have been. No seed file describes a lead, so there is no
     *  `led_*` id in existence to hand to a live endpoint and nothing for a
     *  half-migrated screen to cross with — the failure this whole block exists
     *  to prevent cannot happen in this domain. The desk is the only screen
     *  that shows a lead; there is no detail route yet, so there is nothing it
     *  links into that could still be reading seeds.
     *
     *  With the API off the screen says so rather than improvising. A lead is a
     *  real shop somebody walked into, and a seeded one would be a morning's
     *  work handed to an agent for a business that does not exist. */
    leads: true,

    /** Visits — DR 06's dispatch board. `/visits` for the board, `POST /visits`
     *  to dispatch, `PATCH /visits/:id` for the three writes on a card.
     *
     *  Honest for the same reason leads is: there are no visit fixtures, and
     *  never have been. No seed file describes a field visit, so there is no
     *  `vis_*` id to hand to a live endpoint and nothing for a half-migrated
     *  screen to cross with. The board is the only screen that shows a visit;
     *  there is no detail route, so nothing it links into could still be
     *  reading seeds. The agent it names comes from the live roster, which is
     *  under `agents` above and already true.
     *
     *  With the API off the board says so. A dispatched visit is an offer with
     *  a real 25-minute clock on a real agent's phone; a seeded one would be a
     *  countdown nobody is watching. */
    visits: true,

    /** Campaigns. The worklist and the campaign page both read `/campaigns`;
     *  approving one goes through `POST /campaigns/:id/authorize`, which is
     *  where the money is committed. `campaignsAndInvoicesExist`, later
     *  `invoicesExist`, used to sit at the bottom of this file asserting that
     *  neither was a table; Campaign has been one since DR 02/03 and Invoice
     *  since Lot B, so the constant is gone. */
    campaigns: true,

    /** Access grants and QR scans — `/access`, the agent's Access tab and the
     *  record beside a KYC case. API only; there are no fixtures for somebody
     *  else's history, on purpose. */
    access: true,

    /** Growth — DR 05's milestone templates, the tier ladder and the city
     *  leaderboard. `/milestones/templates` for the CMS and the editor,
     *  `/agents/tier-ladder` for the thresholds, `/agents/leaderboard` for
     *  the board, and `/agents/:id/{tier,milestones}` on the agent page.
     *
     *  The six seeded programs the CMS used to draw are gone rather than
     *  kept as a fallback: their `mls_*` ids were never issued by the
     *  backend, and their fields — an audience, a target event, auto-enrol,
     *  push, enrolled and completed counts — do not exist on
     *  `MilestoneTemplate`. A template here is a target on every agent's
     *  board the moment it is active; a seeded one would have been a reward
     *  nobody could ever claim. With the API off the screens say so. */
    growth: true,

    /** Training — DR 05's curriculum desk. `/training/modules` for the
     *  table and the editor, `/training/modules/:id/admin` for the one read
     *  that carries a question's correctness, `PUT …/questions` for the
     *  set, `/training/certifications` for the certificates and
     *  `/training` for the flat library both apps already read.
     *
     *  Honest for the simplest reason available: there are no training
     *  fixtures, and never have been. No seed file describes a module, a
     *  question or a certificate, so there is no id in existence to hand to
     *  a live endpoint and nothing for a half-migrated screen to cross with.
     *  The four screens under /training are the only ones that show these
     *  records; the certificate row links to `/agents/[id]`, which is under
     *  `agents` above and already true.
     *
     *  With the API off the screens say so. A module is on every agent's
     *  index the moment it is active, and a certificate is a record with a
     *  minted ADX-CERT identifier; a seeded one would be a qualification
     *  nobody earned. */
    training: true,

    /** Package sales — DR 06's book, read by ops through `GET /packages/sales`,
     *  which shows an ADMIN every sale rather than one agent's.
     *
     *  No package fixtures exist and none were removed to get here: no seed
     *  file describes a sale, a package or a commission, so there is no id to
     *  hand to a live endpoint. The desk is the only screen that shows a
     *  sale and there is no detail route, so nothing it links into could
     *  still be reading seeds. The agent it names comes from the live
     *  roster, under `agents` above.
     *
     *  With the API off the desk says so. A sale carries the commission the
     *  wallet recorded when it was paid; a seeded one would be money nobody
     *  was ever owed.
     *
     *  The catalogue editor at `/packages/catalogue` (Lot D, Q94) reads
     *  `GET /packages/catalogue` and writes the plan and add-on routes
     *  under it, and shares this key: a plan is what the next sale is
     *  priced on, and every sale keeps its own snapshot. */
    packages: true,

    /** The audit trail — `GET /audit`, its CSV export and the per-record
     *  timeline that the publisher, advertiser, agent and listing pages draw
     *  as their Activity tab. The ten seeded `aud_*` rows the page used to
     *  draw are gone rather than kept as a fallback: they named actors,
     *  modules and targets the backend never issued, and the row drawer's
     *  before/after diff has no fixture shape at all. With the API off the
     *  page says so. */
    audit: true,

    /** The feature registry — package CG5 over Lot G (answers 144-146).
     *  `GET /flags` for the rows, `GET /flags/registry` for the committed
     *  document with every surface, `PATCH /flags/:key` for the kill
     *  switch, the variant and the rollout, `POST /flags/:key/rollback` and
     *  a flag's change history. `useFeature(key)` / `<FeatureGate>` in
     *  `src/lib/use-feature.tsx` read the same rows once per session to
     *  hide a screen or an action the feature is off for. The seven seeded
     *  flags are gone: their keys were read by nothing, their environments
     *  and owners do not exist on `FeatureFlag`, and a toggle on one of
     *  them changed a toast. Rows come from the registry at boot — every
     *  backend `features.ts` and each package's `features.manifest.json`
     *  (this console's is checked by `scripts/check-features.mjs`) — so the
     *  console cannot create one. */
    flags: true,

    /** Console roles — Lot A's `/roles-config`. The builder reads the real
     *  catalogue from `/roles-config/capabilities` and the roles from
     *  `/roles-config`; membership is written per person through
     *  `PUT /users/:id/role-config`. The five seeded columns and their
     *  thirteen made-up capability ids are gone rather than kept: the real
     *  catalogue is thirteen module groups × tiers plus named capabilities,
     *  a different shape entirely, and a role saved against invented ids
     *  would have been refused with UNKNOWN_PERMISSION. With the API off the
     *  screen says so. */
    roles: true,

    /** Users — the console's own identity domain. The list, the detail page,
     *  the invitations and the members roster under /roles all read `/users`;
     *  the anonymous accept-invite screen reads `/auth/invites/:token`. The
     *  `usr_*` seeds are gone: their ids were never issued by the backend,
     *  and the fields they carried — a city, a verified identity, a session
     *  list for somebody else — have no source on the admin list. Package
     *  CD's closure and erasure desk hangs off the same `/users` routes and
     *  reads this flag too. */
    users: true,

    /** Modular suspension — Lot A's five scopes on the four parties. The
     *  Suspend and Reinstate dialogs on `/listings/[id]`, `/publishers/[id]`,
     *  `/advertisers/[id]` and `/agents/[id]` write `POST /<party>/:id/
     *  suspend|reinstate`, and each page's Suspension card reads the case
     *  and its history from `GET /suspension/:partyType/:partyId`.
     *
     *  Honest for the simplest reason available: no seed file has ever
     *  described a suspension, so there is nothing a half-migrated screen
     *  could cross with, and the four pages it mounts on are all live under
     *  their own flags above. With the API off the card and the buttons say
     *  so. A suspension cancels somebody's orders and freezes somebody's
     *  money; a seeded one would be a restriction nobody imposed. */
    suspension: true,

    /** Print partners — Lot B's payees (B4b). The directory and the partner
     *  page read `/print-partners`, the order page's Printing card reads
     *  `/orders/:id/print-job`, and the wallet the ledger shows is under
     *  `/finance` like every other.
     *
     *  Honest for the simplest reason available: no seed file has ever
     *  described a print shop or a print job, so there is no id a
     *  half-migrated screen could cross with. The partner page links to
     *  `/orders/[id]`, which is under `orders` above and already true. With
     *  the API off the screens say so: a partner is a payee whose approved
     *  costs are real money, and a seeded one would be a shop nobody owes.
     *
     *  G13-B/C: the desk's Quote requests tab reads `/print-quote-requests`
     *  in one call (the per-order fan-out is gone) and cancels an OPEN one
     *  with a reason; the partner page sets the rate card, flips "Accepts
     *  quote requests" and records an invoice on the partner's behalf, and
     *  lists `/print-partners/:id/invoices` with the months. */
    printPartners: true,

    /** The month in numbers — `GET /admin/overview` — and, since Lot G
     *  (package CG1), the analytics set under it. The dashboard's tiles
     *  read the month it is now in India and the month before; its charts
     *  read E6's `?from&to` series. The analytics page reads
     *  `/admin/overview/series` (the daily curve with the previous period
     *  dotted beside it, the four segments, the four series cards),
     *  `/breakdown` (GMV by category, the top-publisher ranking, the
     *  sortable by-city / publisher / advertiser / agent table), `/tiles`
     *  (GMV, take rate, active listings, fill rate) and `/export.csv`
     *  through the blob helper; the dashboard's smart-insight strip is
     *  `/insights`. The seeded KPIs, bars, curve, split, ranking and strip
     *  the two screens used to draw are gone: every figure here is a sum
     *  the server did, and a chart of seeded days beside a tile of real
     *  ones is exactly the half-migration this block exists to prevent.
     *  With the API off both screens say so. */
    analytics: true,

    /** The dashboard as a whole. Every card on it reads a live domain listed
     *  above — the tiles read `analytics`, recent bookings `campaigns`, the
     *  payout runs `finance`, the add-publisher card `supply`, the assign
     *  card `orders` and `agents` — and nothing on it is drawn from a seed
     *  any more. The key exists so the claim is made in one place. */
    dashboard: true,

    /** Finance — the whole section, at last. The wallet, ledger,
     *  payout-method, incentive, settings and withdrawal screens have read
     *  `/finance` since DR 04 with no fixture fallback; Lot B wired the three
     *  that held this key back. Invoices read `/finance/invoices` (the
     *  register, a document, the publishers' uploads, the legal entity).
     *  Payout batches read `/finance/payout-batches`: the list, the batch
     *  page's four real steps — lines, submit, four-eyes approve, preflight
     *  and release — and the bank file, plus `/finance/bank-accounts` under
     *  Settings. Reconciliation reads `/finance/reconciliation`: the imported
     *  statement lines, their summary, the auto-matcher and the per-line
     *  match, ignore and unmatch.
     *
     *  The seeded `batch_*` rows and their `PayoutBatch` type are gone rather
     *  than kept: their ids were never issued by the backend, their lines
     *  guessed a recipient's type from a surname, and the schedule they drew
     *  was never set by anybody. The reconciliation grid's seven hard-coded
     *  rows are gone the same way, and so are the seeded withdrawals with
     *  the `api.finance` namespace that served them — the publisher page's
     *  Payouts tab, their last reader, is empty offline as it is live.
     *  `financeReadsApi()` in `src/services/finance.ts` is now
     *  `isLive("finance")`, as the note here always said it would be.
     *
     *  Lot G (package CG4, Q124/Q125): the Payouts page's "Settled this
     *  month" tile is the summary's `paidThisMonth` and "Next scheduled
     *  run" reads `GET /finance/payout-batches/schedule`, the cadence
     *  edited on /finance/settings as `finance.payoutBatchCadence`; the
     *  reconciliation desk's Export files `/reconciliation/imports/:id/
     *  export.csv` for the chosen import or `/reconciliation/lines/
     *  export.csv` under the filters in force. */
    finance: true,

    /** Creative moderation — Lot D's review desk. The queue reads
     *  `/campaigns/creatives/review-queue`, the workbench
     *  `/campaigns/creatives/:id`, and a decision goes through
     *  `PATCH /campaigns/:id/creatives/:creativeId/review` or the bulk
     *  route. The campaign page's Creatives card links into the same
     *  workbench with the same ids.
     *
     *  The eight seeded `cr_*` creatives are gone rather than kept: their
     *  ids were never issued by the backend, their flags were prose nobody
     *  computed, and their Approve button changed a toast. A decision here
     *  notifies a real advertiser and gates a real print run; a seeded one
     *  would be a print run nobody submitted. With the API off the desk
     *  says so. */
    moderation: true,

    /** Agreements — the templates rail, the acceptances register, the stale
     *  report and the party lookup all read `/agreements`. The service has
     *  been HTTP-only since D9 with no fixture fallback (a seeded agreement
     *  would look exactly like a published one to the person deciding
     *  whether the terms are ready); the key exists so the claim is made
     *  here like every other domain's. */
    agreements: true,

    /** Payments — Lot C's gateway register. `/finance/payments` reads
     *  `GET /payments`, the row reads `GET /payments/:id`, and a refund
     *  goes through `POST /payments/:id/refund`. The Cashfree, CCAvenue and
     *  Razorpay sections under Settings › Integrations read and write
     *  `/integrations`, masked.
     *
     *  Honest for the simplest reason available: no seed file has ever
     *  described a gateway payment, so there is no id a half-migrated
     *  screen could cross with, and the campaign a row links into is under
     *  `campaigns` above. A payment is money that arrived from a real card;
     *  a seeded one would be a capture nobody made. */
    payments: true,

    /** Employees — package CE3 over Lot E's `employees` and `hr` modules.
     *  The overview, the directory, a profile, the departments and the
     *  holiday calendar all read `/employees` and `/hr/holidays`; the create
     *  screen posts `POST /employees` with Lot A's optional console
     *  invitation, a profile edits through `PUT /employees/:userId`, and
     *  the people registry the diary shares is `GET /hr/people`. E10-1
     *  (CE7): the directory pages through the list contract — `?q=`,
     *  `?department=`, `?active=` and `?page=` all server-side, `total` off
     *  the payload and the Active / Inactive chips off `counts`; the
     *  departments and the overview still read every row, asking for
     *  exactly the pages `total` names. The overview's "Internal work" card
     *  opens the `workTool` section's portal URL, set under
     *  Settings › Integrations beside the HR tool.
     *
     *  Q98: HR lives in the HR tool (Zoho People by default), reached by a
     *  portal link off the `hrms` integrations section — so attendance,
     *  leave, payroll and hiring are not screens here any more. The 26
     *  seeded `emp_*` records, the attendance sheet, the leave requests,
     *  the payroll run and the job board are gone rather than kept: their
     *  ids were never issued by the backend, and a region, a work mode, a
     *  CTC or a BGV status has no column on `Employee`. A profile links to
     *  `/users/[id]` (under `users` above) and `/kyc/employees/[id]` (under
     *  `kyc`), both already true. With the API off the screens say so.
     *
     *  Lot G (CG3, Q120/Q122/Q123/Q140): a department is a record now —
     *  `/employees/departments` and `/employees/departments/[id]` read
     *  `GET /hr/departments` and `/:id` (head, description, open roles,
     *  regions, members with their work fields) and write through the
     *  POST / PATCH / DELETE beside them, with a delete refused while
     *  people or departments are still in it; the directory's picker and
     *  Add / Edit employee take the records (`departmentId`) beside the
     *  new `region`, `workMode` and `employmentType`. The overview's
     *  "Workload distribution" chart is `GET /employees/workload`, by
     *  month, banded by `hr.workloadThresholds` under Settings › People.
     *  A holiday's Type column is its `kind`, Public or Optional. */
    employees: true,

    /** The staff diary — Lot E's `schedule` module. The month grid reads
     *  `GET /schedule?from&to` for the visible range, the log reads
     *  `GET /schedule/log`, and every entry write goes to the same routes.
     *  A selected person who is also an agent gets their field work
     *  overlaid read-only from `include=visits,milestones,jobs`, each row
     *  linking under `visits` or `orders` above. E10-1 (CE7): every entry
     *  and log row names its assignee itself (`assignee { id, name }`,
     *  people who have left included), and the person picker's "Show
     *  former" switch is `GET /hr/people?includeInactive=true`.
     *
     *  The seeded `SCH-*` entries and `SLG-*` log rows are gone rather than
     *  kept: they named people by string, carried no assignee id the
     *  registry knows, and the log's "Clear all" deleted a record the
     *  backend never lets anybody delete. With the API off the page says so. */
    schedule: true,

    /** The flow editor — Lot E's `app-config` routes. `/flows` reads
     *  `GET /config/flows` for the keys and versions and `GET /config` for
     *  the bodies; the board is built from `GET /config/schema` and saves
     *  through `PATCH /config/flows/:key`, validated server-side against the
     *  vocabulary both phones render — a refusal's `details.issues` (E10-2)
     *  carries the full path, and the board resolves each to the lane,
     *  screen, field and prop it names, outlining the control with the
     *  message beside it; `POST /config/revert` is the one-step
     *  undo. The three seeded flows are gone rather than kept: their field
     *  kinds (`phone`, `slider`, `image_upload`, `section_header`) were words
     *  no phone renders, and a board that saved them would have been refused
     *  by the server. `listing` is what both apps' listing wizard reads on
     *  boot; `onboarding` is the DR 08 ladder the manifest is composed from.
     *  Lot G (CG3, Q126/Q141): every flow carries a `description` the card
     *  prints and the board's header edits, and `GET /config/flows` lists
     *  four keys — `agent-job` and `employee-intake` are step ladders with
     *  their own vocabulary under `/config/schema`; a board opened on one
     *  not stored yet starts from the code's ladder (`GET /orders/job-ladder`,
     *  `GET /employee-kyc/ladder`, under `orders` and `kyc` above).
     *  With the API off the screens say so. */
    flows: true,

    /** The operator's own feed — the bell, the drawer and the centre read
     *  `GET /notifications`, mark rows read through the two PATCH routes and
     *  write the Preferences matrix through `PUT /notifications/preferences`.
     *  Every route is scoped to the caller by the server, so there is no
     *  record id to cross with anything.
     *
     *  The six seeded `ntf_*` rows are gone rather than kept: their ids were
     *  never issued by the backend, their severity was prose nobody
     *  computed, and Mark all read on them changed a `useState`. With the
     *  API off the bell shows nothing and the centre says so. */
    notifications: true,

    /** Comms — package CE1 over Lot E's dispatcher. `/comms` reads
     *  `GET /comms/templates` and edits through `POST` and `PATCH` (the
     *  server bumps the version); `/comms/delivery-logs` reads
     *  `GET /comms/deliveries`, masked, and `POST /comms/deliveries/:id/resend`
     *  where the template is not sensitive; `/comms/announcements` drafts
     *  through `POST /announcements`, reads the per-channel reach from
     *  `GET /announcements/:id/preview-count`, sends or schedules through
     *  `POST /announcements/:id/send` and cancels through `/cancel`. The SMS
     *  rails and the email door under Settings › Integrations are the same
     *  `/integrations` row the gateways read.
     *
     *  E10-2 (package CE8): the template cards print each row's 30-day
     *  `stats` and the header sums them; the delivery chips read the
     *  page's `byChannel`; Export files `GET /comms/deliveries/export.csv`
     *  under the filters in force through the blob helper; the editor's
     *  Variables card checks the placeholders typed against
     *  `GET /comms/events`; the SMS kinds and rail names on the routing
     *  table come from `GET /comms/sms-kinds`, the mirrored constants
     *  deleted; and the announcement composer shows live reach through
     *  `POST /announcements/preview-count`, drafting only on Send.
     *
     *  The nine seeded templates, their merge variables with sample values,
     *  the six literal delivery rows and the three seeded announcements are
     *  gone rather than kept: a seeded template beside a live one is copy
     *  nobody approved, a seeded delivery is a message nobody received, and
     *  the sending rules the seed drew (conditions, delays, audiences) have
     *  no route to save to. With the API off the screens say so.
     *
     *  Lot G (package CG4, Q117/Q121): the quiet hours and the weekly cap
     *  are the platform's own now — the `comms` section of
     *  `GET/PUT /settings/platform`, edited on /settings — with a
     *  per-template `transactional` switch; `POST /comms/templates/:key/
     *  send-test` sends the saved row to the operator's own address; and
     *  the delivery log's detail card draws `attemptRows` off
     *  `GET /comms/deliveries/:id`. */
    comms: true,

    /** Reports — Lot G (package CG4, Q129) over the `reports` module.
     *  `/settings/reports` reads `GET /reports/catalogue` for the twelve
     *  kinds, runs one through `POST /reports/run`, lists runs and
     *  schedules under the list contract and downloads a run's file
     *  through the blob helper with the admin token. The five literal
     *  schedules and four literal tiles the old `/settings/exports` drew
     *  are deleted rather than kept: a seeded schedule would have been a
     *  report mailed to nobody on a cadence nothing ticks. There is no
     *  detail route, so nothing links into a seed. */
    reports: true,

    /** K-B1: the QR desk — `/qr` and `/qr/scans` read `GET /qr`, a code's
     *  scans and one person's scans, and every button posts to a real
     *  route (generate, regenerate, deactivate with a reason). The image
     *  routes are public and render as plain `<img>` tags. The
     *  `/orders/[id]` pickup-code card has read `GET /qr/:qrId` since A9. */
    qr: true,

    /** Lot AA: the DR 10 Tasks section, on the backend's `work` module.
     *  `/tasks` reads `GET /work/overview`, the board `GET /work/board`,
     *  the risk log `GET /work/issues`, the wizard posts `POST /work/tasks`
     *  and a task's page reads `GET /work/tasks/:id` with its history off
     *  `GET /audit/targets/WorkTask/:id`. The seeded `TSK-*` tasks, their
     *  tracking rows and the `ISS-*` issues of the HEAD copy are gone
     *  rather than kept: their buffer, slack and overtime were an engine
     *  the backend never had (Q70), and a time log's approval state has no
     *  column. With the API off the section says so. */
    work: true,
} as const;

export type LiveDomain = keyof typeof liveDomains;

/** True when this domain's data should come from the API rather than fixtures. */
export const isLive = (domain: LiveDomain): boolean => apiConfig.live && liveDomains[domain];

