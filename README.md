# ADX Admin

Operations console for the ADX out-of-home advertising marketplace — publishers list ad spaces, advertisers book campaigns, field agents fulfil orders, and this console runs the whole exchange.

Built from the ADX admin wireframes on the **ADX Control Ledger** design system: Inter, IBM Plex Sans Condensed metrics, `#8D0B0C` accent, soft status tints.

Wireframes live in the Figma file **ADX** (`pMifkbhIWER4xIbCKt0Nvh`), page **`DR 10 - Admin Panel`** — 98 frames, each named `Screen · /route` so a frame maps to a route by name. Component and brand specs are on the neighbouring `DR 09 - Components` and `DR 11 - Brand Identity` pages. There is a second, separate Figma file titled "AdminPannel" — it is empty, ignore it.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Tailwind CSS** + design tokens in `src/app/globals.css`
- **shadcn/ui** primitives (Radix) in `src/components/ui`
- **TanStack Table** for data grids, **Recharts** for charts
- **react-hook-form + zod** for validated forms, **sonner** for toasts

## Getting started

```bash
npm install
npm run dev         # Turbopack on http://localhost:5173
npm run dev:webpack # webpack fallback for troubleshooting only
npm run build       # production build
npm run lint
```

`/` decides where you land rather than redirecting unconditionally: with
`NEXT_PUBLIC_USE_API=false` it goes straight to `/dashboard`; with the API live it
checks for a stored session and sends you to `/dashboard` or `/login`. That keeps
the signed-out path to a single route load.

Development uses the fixed port from `.env` so the backend's `FRONTEND_URL`
stays valid. Startup exits with a clear error when that port is occupied; stop
the earlier server with Ctrl+C before launching another copy.

## Project structure

```
src/
  app/
    (auth)/          # login, verify (2FA), accept-invite, access-denied,
                     # forgot-password, reset-password, session-expired
    (admin)/         # everything inside the admin shell (layout, loading, error)
      dashboard/
      publishers/ (+ [id], directory, activation, import)   # one section, four tabs (PublishersNav):
                                                 # the overview (O-C, the root), the directory,
                                                 # the activation funnel, the import
      advertisers/ (+ [id], directory, activation)          # one section, three tabs (AdvertisersNav):
                                                 # the overview (the root), the directory, the funnel
      agents/ (+ [id], directory)   listings/ (+ [id], map, new)
                                    # the overview at the root, the roster beside it (AgentsNav)
      campaigns/ (+ [id], new)      bookings/ (+ calendar)
      orders/ (+ [id], pipeline)    kyc/ (+ [id], advertisers, print-partners (+ [id]),
                                          agents (+ [agentId]), employees (+ [employeeId]))
                                    # five party-centric queues on one state vocabulary
                                    # (services/kyc-state); _shared/kyc-row-actions is the
                                    # one-click Digio request every row carries
      print-partners/ (+ [id], roster, quote-requests)   # the overview at the root (PrintPartnersNav),
                                    # the roster and the quote requests; each partner's page carries its KYC card
      finance/ (invoices, payouts, payouts/batch, reconciliation)
      pricing/ (model, categories, dimensions, rate-cards (+ [id]),
                rules, seasonality, simulator, approvals)
      moderation/ (+ [id])          disputes/ (+ fraud)
      support/     comms/ (templates, delivery-logs, announcements)     analytics/
      growth/ (+ [id], ladder, leaderboard)   users/ (+ [id], accounts, admins, closures, erasure)
                                              # the overview at the root, the accounts directory beside it
      roles/ (+ users)              qr/ (+ scans)
      settings/ (reports, flags, integrations, system-health,
                 geographies (+ [slug]))   # V-C: the rollout desk — Overview | Map | Cities | States
                                           # over /geo/*, the city page, the drawer, the stage-change confirm
      audit/       notifications/   account/
      schedule/        # the staff diary, with a person's field work overlaid
      employees/ (directory (+ [id]), departments (+ [id]), holidays, new)
                       # the overview at the root reads GET /section-overviews/employees (O-C)
      flows/ (+ [key], templates)
  components/
    adx/             # design-system components (DataTable, StatusBadge, KpiCard, …)
      overview/      # the overview kit (O-C): WindowPicker, StatTile, MixBar, SeriesCard,
                     # BreakdownTable, TopList, FunnelCard, SectionOverviewLoader
    charts/          # Recharts wrappers
    dashboard/       # the dashboard's three action cards
    layouts/         # AdminShell, Header, Sidebar
    ui/              # shadcn primitives
  config/            # navigation
  data/              # empty — every domain reads the API; check-fixtures guards it
  lib/               # api-client, api-config, auth, formatting, typography
  services/          # data-access layer — swap this for the real API
  types/             # domain models + status metadata
```

89 routes ship. `src/app/(admin)/pricing/_removed/` holds a revenue-share page
that was cut; the `_removed` prefix keeps it out of the router.

## Data layer

**Every domain reads the ADX backend.** Set `NEXT_PUBLIC_USE_API=true` and point
`NEXT_PUBLIC_API_BASE_URL` at `ADX-backendv1`; with it off, every screen behind
the login says so rather than improvising, and the login page cannot sign you
in. There are no seeded fixtures left: `src/data/` is empty, `src/services/`
has no fixture branch, and the signed-in operator comes from `GET /users/me`
through the auth context.

Two screens are the exception, and they are named rather than hidden:
**`/pricing/rules`** and **`/pricing/simulator`** are the old rate-card
screens, kept until they are retired. They read the price-model and pricing
services rather than a seed file, but they were built before the pricing
engine and do not sit under a `liveDomains` key.

### Conventions

- **Loader + service.** A route is a `page.tsx` shell that renders a client
  `*-loader.tsx`; the loader reads through `useApiResource(key, fetcher)` and
  hands the result to a `*-view.tsx` inside `<ResourceBoundary>`. The key names
  the request (`users:list:all:priya:ADMIN:true`) — every facet the server
  cuts on lives in it, so changing one refetches rather than hiding rows a
  capped page never held. The loader owns the request; the view owns the
  frame.
- **`services/<domain>.ts` over `http.*`.** One file per backend module, one
  function per route, the wire types declared beside them. A service refuses
  with a message while its domain is off (`isLive("orders")`) rather than
  falling back to anything. Money is a decimal string end to end; every
  screen prints it with `formatMoney`.
- **`liveDomains` in `src/lib/api-config.ts`** is the claim, made in one place,
  that every screen showing a domain's records reads them from the API —
  including the detail pages other screens link into. A domain is `true` only
  once that holds. The rule it enforces: a half-migrated domain is worse than
  an unmigrated one, because a fixture id handed to a live endpoint 404s on
  every row.
- **`scripts/check-fixtures.mjs`** runs under `npm run lint`. It walks
  `src/data/` for ids defined and ids referenced and fails on a dangling
  reference; with the directory empty it passes and says so. It stays so that
  a fixture file added back is checked the day it lands.
- **Blob downloads** — an invoice PDF, a bank file, the audit CSV, a private
  KYC image — go through `api.blob(path)` in `src/lib/api-client.ts`: the same
  headers, timeout and 401 → refresh → replay as a JSON read, then
  `saveBlob(blob, filename)` hands the bytes to the browser. No service calls
  `fetch` for a file on its own.
- **Fields with no source are dropped, not faked.** Where a DR 10 frame draws a
  number nothing serves, the control is left out and the view's header
  comment says which. A section with no endpoint renders empty and says why.
- **The map is one seam.** `src/components/adx/map.tsx` is the only file that
  imports a map library (`@vis.gl/react-google-maps` for Google; `leaflet` +
  `react-leaflet` for OpenStreetMap, loaded with `ssr: false` because Leaflet
  reads `window` on import, its CSS and default marker images imported there
  once); screens hand it points and a camera and cannot tell which vendor is
  under them. The client config is `GET /app/maps` through
  `src/services/maps.ts` — Google unless ops chose Mapbox or OpenStreetMap
  under Settings › Integrations › Maps. Google draws once its browser key is
  there and, while the key is still to come (Q128), the surface is the same
  honest placeholder the phones draw; OpenStreetMap has no key, so it draws
  as soon as the read lands, from the tile template, attribution and max
  zoom the backend answers (Z-C). The Maps card carries OSM's usage-policy
  fields — the contact email the public Nominatim requires (the backend
  refuses OSM without it), the Nominatim / OSRM / Photon hosts, the tile
  line and the public-tiles warning while the template still names
  `tile.openstreetmap.org`. The zoom-dependent clustering and the camera
  maths are `src/lib/map-geometry.ts`.
- **Every screen belongs to a feature.** `features.manifest.json` at the
  package root maps each route group under `src/app/(admin)` to a feature key
  (`<area>.<capability>`, CONSOLE surface); `scripts/check-features.mjs`
  (`npm run check:features`, under `npm run lint`) fails when a `page.tsx`
  sits under no declared path or a declared path has no page. The backend's
  `npm run features:sync` folds the manifest into `docs/feature-registry.json`,
  which is how Settings › Feature flags lists a console screen the moment it
  exists. A screen or an action the feature can switch off wraps in
  `<FeatureGate feature="…">` (or reads `useFeature(key)`) from
  `src/lib/use-feature.tsx`: one `GET /flags/me` per session, refreshed on
  focus — the server's own evaluation for the operator (G11-2), so the
  console holds no evaluator or bucket of its own. Call sites name the
  canonical key; a key the server did not answer is off.
- **The contract is checked, not assumed.** `scripts/check-contract.mjs`
  (`npm run check:contract`, under `npm run verify`) reads the backend's
  `docs/route-inventory.json` and `prisma/schema.prisma` through the sibling
  `../ADX-backendv1` path — and fails with a clear message when either is
  absent — and runs five audits over the source tree. (a) Routes: every path
  a service calls (`http.*`, `api.*`, and any zero-argument accessor that
  hands the client back — `live().*`, `session().*`, `mutable().*`,
  `desk().*`; template params normalised to `:param`, a `${base}` prefix or
  `${path(id)}` helper resolved from the file's own `const`, a `${}` glued
  to a segment matched as a glob) exists in the inventory with that method.
  (b) Enums: every `*_META` / `*_LABEL` record named in the script's
  `REGISTRY` (`file:RECORD -> enum`) covers its backend enum's values
  exactly — add a row when a new record mirrors an enum. (c) Emptiness of
  `src/types`: no exported lowercase string-literal union there mirrors a
  backend enum (vocabulary comes from `services/`, not `types/`); the four
  UI-derived unions are `ALLOWED_UNIONS`. (d) Wire nullability: the
  inventory carries no response shapes, so nullability is read off the
  schema instead — a `Wire<Model>` interface named after a Prisma model
  types every field the model marks `?` with `| null`, and any other
  `Wire*` field named `*At` / `*Id` carries `| null` when every model
  holding that name marks it optional. (e) Response shapes (S-C, 15 Sep
  2026 — the day after a `City` type claimed an `id` the wire never sends
  and a page crashed on duplicate keys): **every** exported interface a
  service names in the generic of an `http.get/post/patch/put<T>(path)`
  call — not only `Wire*` — is held to what the backend actually answers.
  A required field the response never carries is a failure. The response's
  shape comes from the inventory row when it carries one (`response.fields`);
  otherwise the script follows the route's handler (the last name of its
  middleware chain) into the module's `*.controller.ts` — the module chosen
  by the mount the bootstrap registers the router under — takes what it
  answers with (`res.json({ data })`, `ok(res, x)`), and follows that call
  through the module's service / mapper / repository files and the shared
  helpers they import to a Prisma `select`, a `findMany` over a model (the
  schema's scalar fields plus `include`), or a returned object literal. A
  trace it cannot close — a spread of something unknown, a branch it cannot
  follow, a helper it cannot find, a `Partial<>` or bare `T` generic — is
  reported as *unverifiable*, never passed; `--verbose` lists every one
  with its reason, and a generic of `unknown` claims nothing and is counted
  as such. `KNOWN_DEBT` lists the findings that reproduce today in files
  another lot owns; they are printed, not failed (matched with the `:line`
  after the file name ignored, so an edit above the call does not turn debt
  into a failure), and an entry that stops reproducing fails the check so
  the list cannot rot. The audits are pure functions over text —
  `src/lib/check-contract.test.ts` drives them with fixtures, the City case
  included.

### Live domains

`auth`, `identifiers`, `supply`, `advertisers`, `orders`, `agents`, `support`,
`disputes`, `fraud`, `pricingEngine`, `kyc`, `listings`, `leads`, `visits`,
`campaigns`, `access`, `growth`, `training`, `packages`, `audit`, `flags`,
`roles`, `users`, `suspension`, `printPartners`, `analytics`, `dashboard`,
`finance`, `moderation`, `agreements`, `payments`, `employees`, `schedule`,
`flows`, `notifications`, `comms`, `reports`, `qr` — each with a note in
`api-config.ts` on which routes it reads and what was removed to get there.

**Users** (`/users`, K-B1 — the owner, 14 September: "the user system is
completely unmanageable"). The directory reads `GET /users` through
`usersService.directory` — the search reaches the contact rows, the state
chips (Active | Inactive | Closed) carry the server's per-state `counts`
(read off the envelope beside `data` through `api.getEnvelope`), the role
facet and the sort go to the API and, with the state, live in the URL.
Every row links to the person and carries a menu (Open, Edit, Deactivate /
Reactivate, Reset password); "Create user" (`POST /users`, with a console
role for an ADMIN) sits beside Invite, which stays for the colleague who
should set their own password. `/users/[id]` is the manageable page: the
header names the ids, the state chips and every party the account is
(`parties` off `GET /users/:id`, each a link); the Identity card's Edit
dialog sends `PATCH /users/:id` with the diff only (`userEditDiff`) and
demands a reason when the mobile or the email moves, printing a 409
`CONTACT_TAKEN` as whose the value already is; the Contacts card ("Emails &
phone numbers") reads `/users/:id/contacts` and every move is a route there
— Add, Send code, Verify with the code the person reads back, Mark
verified, Make primary (the confirm names the swap and, for a phone, that
every session on the old number ends), Remove — each with a reason; the
Access card holds the console role, the roles held with Grant a role
(`POST /users/roles`; no route takes one away), the second factor with
Reset, the open sessions (no admin revoke route exists; the card says so),
Reset password, Deactivate / Reactivate, Close account and the read-only
View as for a party; the Activity card reads `/users/:id/activity` and the
QR scans card `GET /qr/scans?scannedById=`.

**Admin users and the authenticator app** (`/users/admins`, `/account`,
`/verify`, Lot K2). The Admin users tab is `GET /users?role=ADMIN` on the
list contract (state chips, sort, search): name, email, phone, console
role, the 2FA column (Authenticator / SMS / Not set, off each row's
`twoFactor` summary with the unused recovery codes), last sign-in, state;
the row menu is Open, Edit, Change role (`PUT /users/:id/role-config` — the
system role drawn disabled unless the operator holds it, decided the
server's way: a member of the system role, or an admin with no role under
the launch rule, read off `GET /users/:id` for the session's own id), Reset
2FA (the confirm names what `POST /users/:id/2fa/reset` clears — the email
backup, the app, the codes) and Deactivate / Reactivate; Invite admin and
Create admin (the create dialog with ADMIN preset) sit in the header. The
user page's Access card shows the same summary with the named reset. On
My account the Authenticator app card reads `GET /auth/2fa/status`: Set
up runs `POST /auth/2fa/totp/enrol` (the QR as an SVG data URL, the key
under a reveal) and `/confirm` (the ten recovery codes shown once, Copy,
Download `.txt` through the blob helper, and an "I have saved them" gate
before the dialog closes); enrolled, it says when and how many codes are
left, Regenerate codes (`/auth/2fa/recovery-codes/regenerate`, the app's
code) and Turn off (`/auth/2fa/totp/disable`, the app's code or a
recovery code). When the policy requires the app and the session carries
`mustEnrolAuthenticator` — the claim on the token, or a 403
`TOTP_ENROLMENT_REQUIRED` the API client reports through
`onEnrolmentRequired` — the shell's `EnrolmentGate` holds the operator on
the same setup and nothing else opens until it is done; confirm answers a
fresh access token and the page reloads. At sign-in `/verify` opens on
the app when the challenge lists AUTHENTICATOR (six digits, no send, no
resend), "Use a recovery code" takes `XXXX-XXXX`, the server's low-codes
warning is printed after a recovery sign-in, and the SMS / email paths
are unchanged. Settings › Access carries the Admin sign-in card with the
two policy switches (`auth.adminTwoFactor`) on the diff-only pattern.

**Party imports** (S-C). One Import tab on every user section —
`/publishers/import`, `/advertisers/import`, `/agents/import`,
`/print-partners/import`, `/employees/import` — on one kit,
`src/components/adx/party-import/`: the upload step with the party's column
table (the backend's `party-imports.schema.ts` columns, `mobile` required
everywhere and `side` for agents) and a downloadable header-only CSV
template, the validation report with the four tiles, outcome chips and the
per-row grid (the party's own cells, an INVALID row's named column marked,
a committed row's "open" link where the console has a page keyed on the id
the commit stamped — not for employees, whose target is the record id while
the profile route takes the user id), Commit / Cancel import behind a
confirm, the report CSV through the blob helper, and the history list.
`party-import-config.ts` holds what differs per party; `import-steps.ts` is
the pure step machine (Lot D's, shared). The four parties talk to
`/party-imports/:party` through `src/services/party-imports.ts` (validate
as multipart, list on the list contract unwrapped to its items, get, commit,
revoke, `report.csv`); the publisher keeps its own routes in
`services/publishers.ts` and is the same kit with its rows' `publisherId`
mapped to the kit's `targetId`. A party's page is gated on that party's
`api-config` domain. The commit is per row and resumable on the server: a
call that dies half-way is picked up where it stopped by the next.

**QR codes** (`/qr`, K-B1). The desk over `GET /qr` on the list contract:
type chips with the server's counts, the active facet, a search over the
code and the reference ids, the pager — all in the URL — with each row's
preview drawn as a plain `<img>` off the public image route (built on the
console's own API base by `qrImageUrl`), its subject as a link where the
server resolved one (`ref.href`), the scan count opening the per-code scans
drawer (`GET /qr/:qrId/scans`, outcome chips with counts, pager), Download
PNG / SVG through the blob helper, Regenerate (confirm; `POST
/qr/:qrId/regenerate`) and Deactivate (reason; `DELETE /qr/:qrId`). Generate
(`POST /qr`) picks the subject on its own roster — the same server-side
searches the command palette fans out to (listings, agents, orders,
publishers, advertisers); AD and ACCESS_GRANT take a typed id — and the
roles that may scan it; the schema takes no expiry, so none is drawn.
`/qr/scans` is one person's scans (`GET /qr/scans?scannedById=`, the person
searched over `GET /users?q=` or named in the URL from their page) with the
outcome chips and a date window sent to the server.
Settings › System health reads `/health/ready` (unauthenticated) and, since
Lot E, `/settings/system-health/ops` and `/history`; since Lot G (CG4) also
`/regions`, `/incidents` and the public `/status` read, with Subscribe posting
to the public page's own `/status/subscribe`. It is gated on `apiConfig.live`
rather than a domain key because it reports on the process, not on records.
Settings › Reports (`/settings/reports`, formerly `/settings/exports`) reads
`/reports/catalogue`, `/reports/runs` and `/reports/schedules` through
`src/services/reports.ts`, with Run now and Download through the blob helper.
Settings › General's Subscriptions card (Lot J2) edits
`settings.subscriptions.{publisher,advertiser}` — the purchase rules a plan
or a package is sold under — on the page's diff-only PUT; GST is not among
them (both quotes read `GET /revenue/tax`, edited at `/finance/revenue#tax`).
The Subscription plans desk (`/packages/catalogue`) prints those rules in a
read-only strip above the cards, and the subscriptions desk
(`/packages/subscriptions`) reads `GET /revenue/subscriptions` on the list
contract (state facet, search, pager, the publisher named on the row) with
the auto-renew flag, an "in grace" note derived from the policy's
`graceDays`, and trial orders marked.

**Geographies** (`/settings/geographies`, V-C over Lot V — the owner:
"the geographical section should be free of any restrictions. Instead
there should be better control features"). The 44-row table with its open /
closed switch is gone; the catalogue is the country (GeoNames, ~6,500 towns,
seeded from the desk through `POST /geo/seed`) and control is a stage per
city — Planned, Seeding, Launched, Paused, Withdrawn — and six function
switches, all through `src/services/geo.ts` over `/geo/*`. Four tabs, the
tab in the URL: Overview (`GET /geo/summary` — a tile per stage linking
into the Cities tab, the states with activity, the Seed button behind a
confirm and disabled once seeded, the `settings.geo` card on the diff-only
PUT); Map (`GET /geo/map?stage=` over the maps seam, a pin per city
coloured by stage, the stage chips refetching, a pin opening the drawer —
and, V-C, the seam now treats a key the vendor REFUSES as the honest
placeholder with the refusal named, through Google's `gm_authFailure` and
the provider's `onError`, so an unbilled key is never a grey map); Cities
(`GET /geo/cities` on the list contract — state, district, stage, kind,
population floor, search, sort and page in the URL, the stage chips with
the server's counts, checked rows raising "Change stage", Add a city for a
place the dataset lacks via `POST /geo/cities`); States (`GET /geo/states`
with counts per stage, Seed this state — `POST /geo/rollout` with
`stateCode` — and Launch capitals, the capitals read off `GET
/geo/cities?kind=` and moved as a `citySlugs` scope). The city drawer and
the page at `/settings/geographies/[slug]` are one panel (`city-panel.tsx`):
the stage with the allowed transitions as buttons, the six switches as
toggles that `PATCH /geo/cities/:slug/rollout` one at a time with what each
gates, the readiness checklist (`GET …/readiness`) drawn ahead of Launch
with the failing checks named — Launch waits on it and, while a check
fails, is offered only as "Launch anyway (N failing)", since the server
never refuses — the seven counts linking into the sections whose overview
takes `?city=` (publishers, advertisers, agents, print partners; listings
and leads have no city facet and stay numbers), the rollout timeline, the
aliases (still `PATCH /pricing/cities/:slug`, the resolver being
pricing's — `isActive` is no longer sent there, the backend 400s it) and
the last note. Every stage move goes through one confirm
(`stage-change-dialog.tsx`) that names the switches the stage sets, lets
them be overridden, and for Withdrawn lists what the hourly wind-down does
— listings unpublished, campaigns run out, leads closed, publishers and
agents told, nothing republished on re-entry — and demands a note; a list,
a state or a district is `POST /geo/rollout`, whose refusals come back
named in `skipped` and are counted beforehand for a list. Everywhere a
city is chosen on the console — the create dialogs for a publisher, an
advertiser, an agent, a print partner, a listing and a lead, and the
overview window's city filter — is the shared `CityCombobox`
(`src/components/adx/city-combobox.tsx`) over `GET /geo/cities?q=`: the
matches under their state with the stage pill, a pick writing the display
name, free text kept as typed since an uncatalogued name passes every gate.
Y-C, over the backend's Y-B (the owner: "both GeoIQ and Azira at the same
time, for rich data on the audience in a particular geography"): the
city page carries an Audience card (`[slug]/city-audience-card.tsx` over
`GET /geo/cities/:slug/audience?period=`, the last three months offered)
— the mean daily footfall per catchment, the mixes as `MixBar`s, "N of M
spots have data", the vendors in force with who each group came from, and
"both vendors agree within 12 %" — and "No panel backs this yet" with a
link to Integrations while no vendor is on; the readiness checklist prints
the soft `audience` check with its basis and never counts it. The
Overview tab's Unresolved spellings card wires Re-resolve to
`POST /geo/backfill-city-keys` (X-L) and prints the per-table report —
what resolved, what is still typed — where it used to name the script.
The same vocabulary (`src/services/audience.ts`: the vendors, the policy
and its one-line preview, provenance, agreement, periods) backs the
Integrations card — two vendor switches with each vendor's credentials and
whether the seam can call it, the catchment radius, and the blend policy
per field group (primary, "other fills a gap", the footfall average),
`PUT /integrations { section: 'audience' }` as a diff of the set, the
policy per key and the typed keys, never the legacy `provider` — and the
listing page's Audience card (`listings/[id]/audience-card.tsx` over
`GET /listings/:id/audience`), which labels footfall, demographics and
affinities with their provenance, prints the agreement line, names a
vendor that could not answer, and keeps each vendor's own answer behind a
"By vendor" toggle. The shared drawing is `src/components/adx/audience-panel.tsx`.

`/dashboard` reads `GET /admin/overview?month=YYYY-MM` through
`src/services/overview.ts` — the month it is now in India and the one before
it (the delta line), plus E6's `?from&to` series for its two charts — and,
since Lot G, `GET /admin/overview/insights` for the smart-insight strip
above the tiles. `/analytics` reads Lot G's analytics set: `/series` for the
daily GMV curve with the previous period beside it and the four series cards
(publishers' earnings, advertisers' spend, agents' commissions, onboarding),
`/breakdown` for GMV by category, the top-publisher ranking and the sortable
by-city / publisher / advertiser / agent table, `/tiles` for GMV, take rate,
active listings and fill rate, and `/export.csv` through the blob helper.
Every figure is a sum the server did over the ledger, the campaigns table or
the KYC queues.

## Design system

Tokens are defined in `src/app/globals.css` and mapped to Tailwind in
`tailwind.config.ts`. The accent (`#8d0b0c`), canvas (`#f5f5f5`), 8px radius and
the status tints match the Figma `ADX Control Ledger` variable collection.

**The brand (QR-9, 17 Sep 2026).** `src/components/adx/brand.tsx` reads
`GET /app/branding` once on load (`BrandProvider` in `app/layout.tsx`; DR 11
from `public/brand/*.svg` until it answers) and writes the primary colour to
`--primary` / `--ring` / `--primary-foreground`, so a published colour
recolours every button and focus ring without a build. `Wordmark` (the
header, the login page) and `Mark` draw the brand's logo URLs.

**Settings › Brand & theme (QR-11)** — `src/app/(admin)/settings/brand/` —
is the one place the brand is managed for every surface. The page edits a
DRAFT (`PUT /branding/draft`) in four sections (QR-12): **Shared
identity** — the name, the four colours (a picker on each swatch, a reset
per colour, presets — DR 11's set, DR 09's dark red, the deep colour as
primary — and the four legibility checks) and the five logo files, each
slot stating the format, the size, the proportions and where every surface
draws it; **Apps** — the sign-in tagline and the 1024 × 1024 launcher icon
for the next build; **Admin panel** — the console title (the tab title's
suffix, swapped in by `BrandProvider`, and the login heading); **Website**
— the site title, the meta description, the hero lines, the hero image
(≥ 1920 × 1080), the share card (exactly 1200 × 630) and the favicon. Each
surface section carries a "what it draws" table and its own preview
(`previews.tsx`); the checks (`brandChecks` in `services/branding.ts`, the
backend's maths repeated) redraw from the form as you type, and a raster
file of the wrong size is refused before it uploads (`image-size.ts`). **Publish**
freezes the draft as the next release (`POST /branding/publish`, with a
note and the flagged checks shown first) and re-reads the brand so the
console recolours at once; **History** lists every release with **Restore**
(`POST /branding/releases/:n/restore`), which republishes an old one. The
phones follow one launch behind (QR-10): they cache the brand at launch
and boot on it next time. `src/app/icon.svg` and `apple-icon.png` are the
DR 11 tile and are baked, like the phones' launcher icons.

Two known gaps, both worth closing before anyone generates code from Figma:

- **The neutral ramp has drifted.** The code ships shadcn's cool zinc neutrals;
  the Figma collection specifies a warm taupe ramp — Ink `#211d1c`, Muted
  `#726662`, Rule `#e2d8d4`, Focus `#ee282a`. The Figma layout scale
  (`Space/*`, `Size/*`, `Radius/Compact`, `Radius/Pill`, `Control/Height`) has no
  counterpart in `globals.css` at all.
- **The wireframes do not bind the design system.** The `DR 10` frames use raw
  hex and raw type — no bound variables, no applied text styles — so Dev Mode
  inspection and codegen emit hardcoded values rather than tokens. Substitute
  tokens by hand when working from a frame.

## Publishers onboarded at the desk (QR-13, 17 Sep 2026)

The desk and the app's ladder are one onboarding. "Onboard a publisher"
(the publishers page's dialog and the dashboard card) is
`src/components/adx/publisher-onboarding-form.tsx` — the ladder's sections
in the ladder's order (account type; the person: first and last name, the
number, email, date of birth, gender; the address off the map with a
draggable pin, through the same `/geo/autocomplete`, `/geo/places` and the
`MapSurface` seam; the business's GSTIN; the contact person) with the app's
required fields per account type (`problemsOf`, mirrored by the backend's
`deskOnboarding`). `POST /publishers` opens the account on the number with
the PUBLISHER role, links it, and with the four readiness basics in marks
the onboarding complete — the owner's first sign-in is OTP → platform terms
→ home. The party page's **Edit details** (`edit-publisher-drawer.tsx`,
`supply.edit`) is the same form over `PATCH /publishers/:id`, prefilled
from the row and the person (`publisher.person` off the detail read). The
bulk import takes the same person and pin columns (`firstName, lastName,
dateOfBirth, gender, latitude, longitude`).

## Who onboarded whom (QR-14, 17 Sep 2026)

Every party page says how the account arrived and who opened it — "Onboarded:
Desk · Asha Rao (Ops manager) · 17 Sep" — off `onboarding` on the detail
read (`onboardingLine` in `types/directory.ts`); the publisher roster's
"Onboarded" column says the same, with an "Onboarded via" filter beside the
KYC one. **Settings › Reports › Onboarding board** (also a tab on the
publishers pages) is the team's view: `GET /reports/boards/onboarding` for a
window preset or a from/to, cut by door or role, ranked by parties
onboarded with the milestones each reached; self-signups sit apart as
"organic". "Export as report" leads to the `onboarding-board` report kind,
which prints the same rows as CSV.

## The desk onboards an advertiser the way the app does (QR-15, 17 Sep 2026)

The publisher's QR-13/14 pieces, on the advertiser side. **Advertisers ›
Onboard an advertiser** is one form in the app's order — account type,
the person, billing — with the app's required set (first and last name,
the number, the billing address, the city; a company name for anyone but
an individual) and the rest optional; the server opens the sign-in account
with the number and the ADVERTISER role up front, so the owner signs in,
agrees to the terms and carries on. The advertiser page has **Edit
details** (`demand.edit`): the same form, prefilled from the row and the
person behind it (`person` on `GET /advertisers/:id`), saved with
`PATCH /advertisers/:id` — a profile nobody has claimed that is given a
first name gets its account opened. The page prints "Person", "Billing
address" and "Onboarded"; the roster has an "Onboarded" column and an
"Onboarded via" filter. The advertiser import takes the four person
columns. Files: `app/(admin)/advertisers/advertiser-onboarding-form.tsx`,
`create-advertiser-dialog.tsx`, `[id]/edit-advertiser-drawer.tsx`.

## Known gaps

Eight shipped routes have no wireframe on `DR 10`: the three core detail
screens `/campaigns/[id]`, `/orders/[id]` and `/listings/[id]`, plus
`/comms/templates`, `/roles/users`, `/pricing/rate-cards`,
`/pricing/seasonality` and `/flows/[key]`.

Fifteen routes have duplicate frames on that page, left over from two generation
passes — check the frame you are building from is the current one. The three
`/dashboard` frames are deliberate: default, notifications drawer and command
palette states.

One screen is wireframed nowhere and built nowhere: a **global search
results page** (⌘K opens the command palette, which has no full-page results
view). **Announcements** has no frame either, but `/comms/announcements` is
built over `/announcements` — the compose form, the per-channel reach from
`preview-count`, send-or-schedule, and the history with cancel.
