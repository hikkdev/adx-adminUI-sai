# ADX Admin

Operations console for the ADX out-of-home advertising marketplace — publishers list ad spaces, advertisers book campaigns, field agents fulfil orders, and this console runs the whole exchange.

Built from the ADX admin wireframes (Figma · "DR 10 – Admin Panel") on the **ADX Control Ledger** design system: Inter, IBM Plex Sans Condensed metrics, `#8D0B0C` accent, zinc neutrals, soft status tints.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript)
- **Tailwind CSS** + design tokens in `src/app/globals.css`
- **shadcn/ui** primitives (Radix) in `src/components/ui`
- **TanStack Table** for data grids, **Recharts** for charts
- **react-hook-form + zod** for validated forms, **sonner** for toasts

## Getting started

```bash
npm install
npm run dev         # Turbopack on http://localhost:5173 → /dashboard
npm run dev:webpack # webpack fallback for troubleshooting only
npm run build      # production build
npm run lint
```

Development uses the fixed port from `.env` so the backend's `FRONTEND_URL`
stays valid. Startup exits with a clear error when that port is occupied; stop
the earlier server with Ctrl+C before launching another copy.

## Project structure

```
src/
  app/
    (auth)/        # login, verify (2FA), forgot-password, session-expired
    (admin)/       # everything inside the admin shell
      dashboard/   publishers/   advertisers/   agents/
      listings/    campaigns/    orders/ (+ pipeline kanban)   bookings/
      kyc/ (+ review workbench)  finance/ (withdrawals, payouts, wizard, invoices)
      disputes/    support/      moderation/    analytics/
      growth/ (+ milestone editor)  roles/ (+ admin users)
      settings/    account/      audit/
  components/
    adx/           # design-system components (DataTable, StatusBadge, KpiCard, …)
    charts/        # Recharts wrappers
    layouts/       # AdminShell, Header, Sidebar
    ui/            # shadcn primitives
  config/          # navigation
  data/            # deterministic mock data (seeded from the wireframes)
  services/        # data-access layer — swap this for the real API
  types/           # domain models + status metadata
```

## Data layer

Every page reads through `src/services/index.ts`, which currently serves
deterministic mock data from `src/data/*`. Replacing mocks with real endpoints
is a change to the service layer only — pages and components are already typed
against the domain models in `src/types`.

## Implemented in this pass

Shell (header, collapsible sidebar, ⌘K/"/" global search, notifications
drawer), auth + error states, Dashboard, Publishers, Advertisers, Agents,
Listings, Campaigns, Orders (board, detail, drag-and-drop pipeline), Bookings,
KYC queue + review workbench, Finance (withdrawal approvals, payouts, batch
wizard, invoices), Disputes & refunds, Support console, Content review,
Analytics, Growth CMS (+ milestone editor), Roles & permissions, Admin users,
Settings, My account, Audit log.

## Next passes (wireframes exist in Figma)

Pricing suite (overview, rate cards, builder, simulator, revenue share,
approval queue, category rules, seasonality, rule builder), Inventory map,
Booking calendar, Import publishers, Reconciliation, Fraud investigation,
System health, Notification templates, Scheduled exports, Announcements,
Integrations & API keys, Delivery logs, Feature flags, Listings/Campaigns
create wizards, Global search results page.
