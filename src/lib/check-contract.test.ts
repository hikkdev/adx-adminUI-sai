import { describe, expect, it } from "vitest";

import {
    auditEnums,
    auditNullability,
    auditRoutes,
    auditUnions,
    checkContract,
    constantsOf,
    extractCalls,
    extractLowercaseUnions,
    extractRecords,
    extractWireInterfaces,
    normalisePath,
    auditResponses,
    extractFunctions,
    extractInterfaces,
    genericClaim,
    indexBackend,
    mountsOf,
    parseEnums,
    parseModels,
    responseShapeOf,
    routeExists,
    routeFor,
} from "../../scripts/check-contract.mjs";

/**
 * `scripts/check-contract.mjs` — the console's contract check (Q-C item
 * 12). It runs under `npm run verify`, so what it fails on is what a build
 * fails on: a service calling a route the backend does not serve, a
 * `*_META` record that misses an enum value, a lowercase union in
 * `src/types` that mirrors a backend enum, a `Wire*` field typed
 * non-null where the schema says optional, and — S-C — an interface a
 * service says a route answers with that claims a field the backend's
 * handler never sends. The audits are pure over text; these hand them
 * fixtures.
 */

const schema = `
enum KycStatus {
  PENDING
  VERIFIED
  REJECTED
  /// Lot D: ops flagged documents.
  NEEDS_INFO
}

enum ListingClaimStatus {
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

model ListingClaim {
  id           String             @id @default(cuid())
  listingId    String
  status       ListingClaimStatus @default(PENDING)
  evidenceNote String?
  decidedAt    DateTime?
  createdAt    DateTime           @default(now())
  listing      Listing            @relation(fields: [listingId], references: [id])
  tags         String[]
}

model Publisher {
  id        String    @id
  agentId   String?
  closedAt  DateTime?
  createdAt DateTime  @default(now())
}

model Order {
  id      String @id
  agentId String
}

model City {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  state     String?
  aliases   String[]
  isActive  Boolean  @default(true)
  updatedAt DateTime @updatedAt
}

/// Tokens: {PREFIX} {SEQ} — a brace in a doc comment must not end the block.
model PublisherImport {
  id        String  @id
  fileName  String
  pattern   String  @default("{PREFIX}-{SEQ}")
  rowCount  Int     @default(0)
  rows      PublisherImportRow[]
}

model PublisherImportRow {
  id       String @id
  importId String
}
`;

const routes = [
    { method: "GET", path: "/api/v1/supply/claims" },
    { method: "PATCH", path: "/api/v1/supply/claims/:claimId/decide" },
    { method: "GET", path: "/api/v1/publishers/:id" },
    { method: "POST", path: "/api/v1/publishers/:id/suspend" },
    { method: "POST", path: "/api/v1/agents/:id/suspend" },
    { method: "GET", path: "/api/v1/finance/wallets" },
    { method: "GET", path: "/api/v1/access-grants/log/:partyType/:partyId" },
    { method: "GET", path: "/api/v1/qr/:qrId/image.png" },
    { method: "GET", path: "/api/v1/qr/:qrId/image.svg" },
];

describe("the schema parsers", () => {
    it("reads enums with their values and models with scalar/enum fields and nullability, relations and lists left out", () => {
        const enums = parseEnums(schema);
        expect(enums.get("KycStatus")).toEqual(["PENDING", "VERIFIED", "REJECTED", "NEEDS_INFO"]);
        const claim = parseModels(schema).get("ListingClaim")!;
        expect(claim.get("evidenceNote")).toEqual({ type: "String", optional: true, list: false });
        expect(claim.get("status")).toEqual({ type: "ListingClaimStatus", optional: false, list: false });
        expect(claim.get("tags")?.list).toBe(true);
        expect(claim.has("listing")).toBe(false);
    });
});

describe("(a) routes", () => {
    it("extracts every http/live/session call with its method, template params as :param, the query dropped", () => {
        const source = `
            export const s = {
                a: () => http.get<Row[]>(\`/supply/claims?\${cursorQuery(cursor)}&status=\${status}\`),
                b: (id: string) => live().patch<Row>(\`/supply/claims/\${id}/decide\`, { approve }),
                c: () => session().post("/auth/2fa/totp/enrol"),
                d: () => http.getEnvelope<Row[]>('/finance/wallets'),
                // e: () => http.delete("/commented/out"),
            };`;
        expect(extractCalls(source).map((c) => `${c.method} ${c.path}`)).toEqual([
            "GET /supply/claims",
            "PATCH /supply/claims/:param/decide",
            "POST /auth/2fa/totp/enrol",
            "GET /finance/wallets",
        ]);
    });

    it("resolves a ${base} prefix, a ${path(id)} helper, a ternary and a string record from the file's own consts", () => {
        const source = `
            const base = "/finance";
            const path = (id: string) => \`/publishers/\${encodeURIComponent(id)}\`;
            const PARTY_PATH: Record<Party, string> = { PUBLISHER: "publishers", AGENT: "agents" };
            function f(kind: string) {
                const prefix = kind === "PUBLISHER" ? "/publishers" : "/agents";
                return http.post(\`\${prefix}/\${id}/suspend\`);
            }
            http.get(\`\${base}/wallets\${query({ kind })}\`);
            http.get(\`\${path(id)}\`);
            http.post(\`/\${PARTY_PATH[partyType]}/\${partyId}/suspend\`);
            http.get(\`\${unknownHelper(id)}/x\`);`;
        expect(constantsOf(source).get("prefix")).toEqual(["/publishers", "/agents"]);
        const calls = extractCalls(source);
        expect(calls.filter((c) => c.path).map((c) => `${c.method} ${c.path}`)).toEqual([
            "POST /publishers/:param/suspend",
            "POST /agents/:param/suspend",
            "GET /finance/wallets*",
            "GET /publishers/:param",
            "POST /publishers/:param/suspend",
            "POST /agents/:param/suspend",
        ]);
        expect(calls.filter((c) => c.unresolved)).toHaveLength(1);
    });

    it("normalises a param that is the whole segment, and a ${} glued to a segment to a glob the segment is matched by", () => {
        expect(normalisePath("/users${qs}")).toEqual(["/users*"]);
        expect(normalisePath("/advertisers/${id}/brands${query({ q })}")).toEqual(["/advertisers/:param/brands*"]);
        // A `?` inside the template expression is a ternary, not the query string.
        expect(normalisePath('/qr/${encodeURIComponent(id)}/image.${kind}${kind === "png" ? "?size=600" : ""}')).toEqual(["/qr/:param/image.**"]);
        expect(normalisePath("${base}/x", new Map())).toBeNull();
    });

    it("matches an inventory param against a :param or a literal segment, a glob by its literal parts, never a different length", () => {
        expect(routeExists(routes, "GET", "/api/v1/publishers/:param")).toBe(true);
        expect(routeExists(routes, "GET", "/api/v1/access-grants/log/advertiser/:param")).toBe(true);
        expect(routeExists(routes, "GET", "/api/v1/publishers/:param/listings")).toBe(false);
        expect(routeExists(routes, "DELETE", "/api/v1/publishers/:param")).toBe(false);
        expect(routeExists(routes, "GET", "/api/v1/finance/wallets*")).toBe(true);
        expect(routeExists(routes, "GET", "/api/v1/qr/:param/image.**")).toBe(true);
        expect(routeExists(routes, "GET", "/api/v1/qr/:param/img.*")).toBe(false);
        expect(routeFor(routes, "GET", "/api/v1/qr/:param/image.**")?.path).toBe("/api/v1/qr/:qrId/image.png");
    });

    it("names the file, line, method and path of a call the inventory does not carry", () => {
        const files = {
            "services/supply.ts": `
                http.get("/supply/claims");
                http.get("/supply/claims/nope");`,
        };
        const { problems, checked } = auditRoutes(files, routes);
        expect(checked).toBe(2);
        expect(problems).toEqual(["services/supply.ts:3: GET /supply/claims/nope is not in the backend's route inventory"]);
    });
});

describe("(b) enums", () => {
    const enums = parseEnums(schema);

    it("reads a record's top-level keys through nested objects and comments", () => {
        const source = `
            export const LISTING_CLAIM_STATUS_META: Record<ListingClaimStatus, { label: string; tone: Tone }> = {
                PENDING: { label: "Pending", tone: "warning" },
                /** Approved: the listing moves. */
                APPROVED: { label: "Approved", tone: "success" },
                REJECTED: { label: "Rejected, with a note", tone: "danger" }, // a: b
                WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
            };
            export const OTHER_LABEL: Record<string, string> = build();`;
        const [record] = extractRecords(source);
        expect(record).toEqual({ name: "LISTING_CLAIM_STATUS_META", partial: false, keyType: "ListingClaimStatus", keys: ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"] });
        expect(extractRecords(source)).toHaveLength(1);
    });

    it("passes a registered record that covers the enum, fails one that misses a value or carries a stranger", () => {
        const files = {
            "services/a.ts": `export const KYC_TONE: Record<string, Tone> = { PENDING: "warning", VERIFIED: "success", REJECTED: "danger", NEEDS_INFO: "warning" };`,
            "services/b.ts": `export const CLAIM_META: Record<ListingClaimStatus, StatusMeta> = { PENDING: m, APPROVED: m, REJECTED: m };`,
            "types/c.ts": `export const KYC_CASE_STATUS_META: Record<KycCaseStatus, StatusMeta> = { pending: m, VERIFIED: m, REJECTED: m, NEEDS_INFO: m };`,
        };
        const registry = { "services/a.ts:KYC_TONE": "KycStatus", "services/b.ts:CLAIM_META": "ListingClaimStatus", "types/c.ts:KYC_CASE_STATUS_META": "KycStatus" };
        const { problems, checked } = auditEnums(files, enums, registry);
        expect(checked).toBe(3);
        expect(problems).toEqual([
            "services/b.ts: CLAIM_META misses [WITHDRAWN] of enum ListingClaimStatus",
            "types/c.ts: KYC_CASE_STATUS_META covers [NEEDS_INFO, REJECTED, VERIFIED, pending] but enum KycStatus is [NEEDS_INFO, PENDING, REJECTED, VERIFIED]",
        ]);
    });

    it("fails a registry row no file declares, and one against an enum the schema lacks", () => {
        const files = { "services/a.ts": `export const X_META: Record<X, S> = { A: m };` };
        const { problems } = auditEnums(files, enums, { "services/a.ts:X_META": "Nope", "services/gone.ts:GONE_META": "KycStatus" });
        expect(problems).toEqual([
            "services/a.ts: X_META is registered against enum Nope, which schema.prisma does not define",
            "registry names services/gone.ts:GONE_META, which no file declares — the record moved, or the registry is stale",
        ]);
    });
});

describe("(c) lowercase unions in src/types", () => {
    const enums = parseEnums(schema);

    it("finds exported lowercase unions of two or more members and nothing else", () => {
        const source = `
            export type KycCaseStatus = "awaiting_review" | "needs_info" | "rejected";
            export type KycStatus = "PENDING" | "VERIFIED";
            export type Only = "one";
            type NotExported = "a" | "b";`;
        expect(extractLowercaseUnions(source)).toEqual([{ name: "KycCaseStatus", members: ["awaiting_review", "needs_info", "rejected"] }]);
    });

    it("flags a union that mirrors an enum by name or by two members under the same leading word, and lets the allowed ones through", () => {
        const files = {
            "types/finance.ts": `
                export type KycCaseStatus = "awaiting_review" | "needs_info" | "rejected";
                export type ListingClaimStatus = "pending" | "approved";
                export type DisputeStatus = "open" | "resolved";
                export type Tone = "success" | "warning" | "danger";`,
        };
        const { problems, checked } = auditUnions(files, enums, ["DisputeStatus"]);
        expect(checked).toBe(4);
        expect(problems).toEqual([
            "types/finance.ts: KycCaseStatus is a lowercase union mirroring enum KycStatus (needs_info, rejected) — vocabulary belongs in services/, not types/",
            "types/finance.ts: ListingClaimStatus is a lowercase union mirroring enum ListingClaimStatus (pending, approved) — vocabulary belongs in services/, not types/",
        ]);
    });
});

describe("(d) wire nullability", () => {
    const models = parseModels(schema);

    it("reads a Wire interface's depth-one fields with their optionality and type text", () => {
        const source = `
            export interface WireListingClaim {
                id: string;
                /** The note, when filed. */
                evidenceNote: string | null;
                decidedAt?: string | null;
                nested: { at: string };
                listing?: { id: string; title: string } | null;
            }`;
        const [iface] = extractWireInterfaces(source);
        expect(iface.name).toBe("WireListingClaim");
        expect(iface.fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${f.type}`)).toEqual([
            "id: string",
            "evidenceNote: string | null",
            "decidedAt?: string | null",
            "nested: { at: string }",
            "listing?: { id: string; title: string } | null",
        ]);
    });

    it("holds a Wire<Model> to the model's own nullability, and any other Wire* to the *At/*Id names every model marks optional", () => {
        const files = {
            "services/supply.ts": `
                export interface WireListingClaim {
                    id: string;
                    evidenceNote: string;
                    decidedAt: string | null;
                    createdAt: string;
                }
                export interface WirePublisherRow {
                    id: string;
                    closedAt: string;
                    agentId: string;
                    createdAt: string;
                    payload?: unknown;
                }`,
        };
        const { problems, ambiguous } = auditNullability(files, models);
        // agentId is optional on Publisher and required on Order: ambiguous by name, skipped.
        expect(ambiguous).toBe(1);
        expect(problems).toEqual([
            "services/supply.ts: WireListingClaim.evidenceNote is typed `string` but ListingClaim.evidenceNote is optional in schema.prisma — add `| null`",
            "services/supply.ts: WirePublisherRow.closedAt is typed `string` but every model holding closedAt marks it optional — add `| null`",
        ]);
    });
});

/* ------------------------------------------------------------------ */
/* (e) response shapes                                                  */
/* ------------------------------------------------------------------ */

/**
 * A backend the size of one module, in the shapes the real one uses: a
 * controller answering `ok(res, …)` and `res.json({ data })`, a service
 * returning what its repository object returns, a Prisma `select`, a
 * `findUnique` with an `include` held in a constant, a view mapper that
 * spreads its row, a handler with a branch the trace cannot follow, a
 * shared helper reached through `../../shared/…`, and two controllers
 * defining the same handler name under different mounts.
 */
const backend = {
    "bootstrap/register-modules.ts": `
        import { pricingRouter } from '../modules/pricing';
        import { publisherRouter } from '../modules/publishers';
        import { partyImportsRouter } from '../modules/party-imports';
        apiRouter.use('/pricing', pricingRouter);
        apiRouter.use('/publishers', publisherRouter);
        apiRouter.use('/party-imports', partyImportsRouter);`,
    "shared/pagination/list-page.ts": `
        export function toListPage<T>(items: T[], total: number, counts: Record<string, number>, query: { page: number; pageSize: number }): ListPage<T> {
          return { items, total, page: query.page, pageSize: query.pageSize, counts };
        }`,
    "shared/pagination/index.ts": `export * from './list-page';`,
    "modules/pricing/pricing.controller.ts": `
        import { listAllCities, updateCity, listVenues } from './pricing.service';
        const ok = (res: Response, data: unknown): void => {
          res.json({ success: true, data });
        };
        export async function listCitiesHandler(_req: Request, res: Response): Promise<void> {
          ok(res, await listAllCities());
        }
        export async function updateCityHandler(req: Request, res: Response): Promise<void> {
          const { before, after } = await updateCity(param(req, 'slug'), parse(updateCitySchema, req.body));
          ok(res, after);
        }
        export async function listVenuesHandler(req: Request, res: Response): Promise<void> {
          if (req.query.all) {
            ok(res, await listVenues());
            return;
          }
          ok(res, (await listVenues()).filter(somePredicate));
        }`,
    "modules/pricing/pricing.service.ts": `
        import { prismaPricingRepository as repository } from './prisma-pricing.repository';
        export async function listAllCities(): Promise<CityRow[]> {
          return repository.listAllCities();
        }
        export async function updateCity(slug: string, patch: { isActive?: boolean }) {
          const before = await repository.findCity(slug);
          if (!before) throw new ApiError(404, 'NOT_FOUND', 'City not found');
          const after = await repository.updateCity(slug, patch);
          return { before, after };
        }
        export const listVenues = () => repository.listVenues();`,
    "modules/pricing/prisma-pricing.repository.ts": `
        const venueSelect = { id: true, name: true } as const;
        export const prismaPricingRepository = {
          async listAllCities(): Promise<CityRow[]> {
            return prisma.city.findMany({
              select: { slug: true, name: true, state: true, aliases: true, isActive: true },
              orderBy: { name: 'asc' },
            });
          },
          findCity(slug: string) {
            return prisma.city.findUnique({ where: { slug } });
          },
          updateCity(slug: string, data: { isActive?: boolean }) {
            return prisma.city.update({ where: { slug }, data, select: { slug: true, name: true, isActive: true } });
          },
          listVenues() {
            return prisma.venueType.findMany({ select: { ...venueSelect, slug: true } });
          },
        };`,
    "modules/publishers/import/publisher-import.controller.ts": `
        import { getImport, listImports } from './publisher-import.service';
        export async function listImportsHandler(_req: Request, res: Response): Promise<void> {
          res.json({ success: true, data: await listImports() });
        }
        export async function getImportHandler(req: Request, res: Response): Promise<void> {
          res.json({ success: true, data: await getImport(req.params['id'] as string) });
        }`,
    "modules/publishers/import/publisher-import.service.ts": `
        import { prismaPublisherImportRepository as repository } from './prisma-publisher-import.repository';
        export const listImports = () => repository.listImports();
        export async function getImport(id: string) {
          const found = await repository.findImport(id);
          if (!found) throw new ApiError(404, 'NOT_FOUND', 'Import not found');
          return found;
        }`,
    "modules/publishers/import/prisma-publisher-import.repository.ts": `
        const withRows = { rows: { orderBy: { rowNumber: 'asc' as const } } } as const;
        export const prismaPublisherImportRepository = {
          listImports() {
            return prisma.publisherImport.findMany({ orderBy: { createdAt: 'desc' } });
          },
          findImport(id: string) {
            return prisma.publisherImport.findUnique({ where: { id }, include: withRows });
          },
        };`,
    "modules/party-imports/party-imports.controller.ts": `
        import { listImports } from './party-imports.service';
        export async function listImportsHandler(req: Request, res: Response): Promise<void> {
          res.json({ success: true, data: await listImports(partyOf(req), query.data) });
        }
        export async function summaryHandler(req: Request, res: Response): Promise<void> {
          const rows = await loadRows();
          res.json({ success: true, data: rows.map(toSummary) });
        }
        export async function csvHandler(req: Request, res: Response): Promise<void> {
          res.set('Content-Type', 'text/csv');
          res.send(await importReportCsv(req.params['id'] as string));
        }`,
    "modules/party-imports/party-imports.service.ts": `
        import { toListPage } from '../../shared/pagination';
        import { prismaPartyImportsRepository as repository } from './prisma-party-imports.repository';
        export const listImports = (party: string, query: ListQuery) => repository.listImports(party, query);
        export function toSummary(row: Row) {
          return { ...enrich(row), label: row.fileName };
        }`,
    "modules/party-imports/prisma-party-imports.repository.ts": `
        import { toListPage } from '../../shared/pagination';
        export const prismaPartyImportsRepository = {
          async listImports(party, query) {
            const [items, total, groups] = await Promise.all([
              prisma.partyImport.findMany({ where: { party }, ...listArgs(query) }),
              prisma.partyImport.count({ where: { party } }),
              prisma.partyImport.groupBy({ by: ['status'], where: { party }, _count: { _all: true } }),
            ]);
            return toListPage(items, total, countsFrom(groups), query);
          },
        };`,
};

const chain = (handler: string) => ["requestId", "authenticate", "requireRole(ADMIN)", handler];
const responseRoutes = [
    { method: "GET", path: "/api/v1/pricing/cities", chain: chain("listCitiesHandler") },
    { method: "PATCH", path: "/api/v1/pricing/cities/:slug", chain: chain("updateCityHandler") },
    { method: "GET", path: "/api/v1/pricing/venues", chain: chain("listVenuesHandler") },
    { method: "GET", path: "/api/v1/publishers/imports", chain: chain("listImportsHandler") },
    { method: "GET", path: "/api/v1/publishers/imports/:id", chain: chain("getImportHandler") },
    { method: "GET", path: "/api/v1/party-imports/:party", chain: chain("listImportsHandler") },
    { method: "GET", path: "/api/v1/party-imports/:party/summary", chain: chain("summaryHandler") },
    { method: "GET", path: "/api/v1/party-imports/:party/:id/report.csv", chain: chain("csvHandler") },
    { method: "GET", path: "/api/v1/declared", chain: chain("<anon>"), response: { fields: ["id", "label"] } },
    { method: "GET", path: "/api/v1/anonymous", chain: chain("<anon>") },
];

describe("(e) response shapes — the backend side", () => {
    const index = () => indexBackend(backend, parseModels(schema));
    const shapeOf = (method: string, path: string) => responseShapeOf(responseRoutes.find((r) => r.method === method && r.path === path)!, index());

    it("reads every function a backend file defines — declarations, object methods, arrow constants with a block or an expression body", () => {
        const names = extractFunctions(backend["modules/pricing/prisma-pricing.repository.ts"]).map((fn) => fn.name);
        expect(names).toEqual(["listAllCities", "findCity", "updateCity", "listVenues"]);
        const service = extractFunctions(backend["modules/pricing/pricing.service.ts"]);
        expect(service.map((fn) => `${fn.name}${fn.expression ? " (expression)" : ""}`)).toEqual(["listAllCities", "updateCity", "listVenues (expression)"]);
        // A call statement at the start of a line is not a method definition.
        expect(extractFunctions(`\n  logger.info(x);\n  await other(y)\n    .then((z) => { return z; });`).map((fn) => fn.name)).toEqual([]);
    });

    it("reads the bootstrap's mounts to the module each router comes from", () => {
        expect(mountsOf(backend["bootstrap/register-modules.ts"])).toEqual([
            { mount: "/pricing", module: "modules/pricing" },
            { mount: "/publishers", module: "modules/publishers" },
            { mount: "/party-imports", module: "modules/party-imports" },
        ]);
    });

    it("follows a handler through the service to the repository's Prisma select — the City case", () => {
        expect(shapeOf("GET", "/api/v1/pricing/cities")).toEqual({ fields: ["slug", "name", "state", "aliases", "isActive"], open: false, source: "listCitiesHandler" });
        // `ok(res, after)` where `after` was assigned from a destructured call — the trace stops there.
        expect(shapeOf("PATCH", "/api/v1/pricing/cities/:slug")).toMatchObject({ unverifiable: expect.stringContaining("updateCityHandler") });
    });

    it("takes the schema's scalar fields plus the include for a Prisma read without a select, the brace in a doc comment and a default notwithstanding", () => {
        expect(shapeOf("GET", "/api/v1/publishers/imports/:id")).toEqual({ fields: ["id", "fileName", "pattern", "rowCount", "rows"], open: false, source: "getImportHandler" });
        expect(shapeOf("GET", "/api/v1/publishers/imports")).toEqual({ fields: ["id", "fileName", "pattern", "rowCount"], open: false, source: "listImportsHandler" });
    });

    it("picks the handler by the route's mount when two controllers define the name, and reaches a shared helper through its import", () => {
        expect(shapeOf("GET", "/api/v1/party-imports/:party")).toEqual({ fields: ["items", "total", "page", "pageSize", "counts"], open: false, source: "listImportsHandler" });
    });

    it("resolves a select that spreads a constant, and unions the branches of a handler", () => {
        expect(shapeOf("GET", "/api/v1/pricing/venues")).toMatchObject({ unverifiable: expect.stringContaining("listVenuesHandler") });
    });

    it("reports unverifiable — never a pass — for a spread of something it cannot follow, a CSV answer, an anonymous handler", () => {
        expect(shapeOf("GET", "/api/v1/party-imports/:party/summary")).toEqual({ unverifiable: "summaryHandler: the response is built with a spread or an unresolved select/include" });
        expect(shapeOf("GET", "/api/v1/party-imports/:party/:id/report.csv")).toEqual({ unverifiable: "csvHandler answers with no JSON data the script can read" });
        expect(shapeOf("GET", "/api/v1/anonymous")).toEqual({ unverifiable: "the route ends in an anonymous handler" });
    });

    it("uses the response shape an inventory row carries before tracing anything", () => {
        expect(shapeOf("GET", "/api/v1/declared")).toEqual({ fields: ["id", "label"], open: false, source: "inventory" });
    });
});

describe("(e) response shapes — the console side", () => {
    const lookup = (source: string) => {
        const declared = new Map(extractInterfaces(source).map((iface) => [iface.name, iface]));
        return (name: string) => declared.get(name) ?? null;
    };

    it("reads any exported interface — not only Wire* — with its parents and whether it is open", () => {
        const found = extractInterfaces(`
            export interface Row { id: string; label?: string }
            export interface Detail extends Row { rows: Row[] }
            export type Loose = Omit<Row, "label"> & { extra: string };
            interface Local { [key: string]: unknown }
            export interface WirePage<T> { items: T[]; total: number }`);
        expect(found.map((iface) => `${iface.name}${iface.open ? " (open)" : ""} <- ${iface.parents.join(",")}`)).toEqual([
            "Row <- ",
            "Detail <- Row",
            "Loose (open) <- ",
            "Local (open) <- ",
            "WirePage <- ",
        ]);
    });

    it("reads what a call's generic claims: a name, an array, a nullable, a wrapper's own fields, an inline type, an intersection; skips unknown; cannot read a utility type or a parameter", () => {
        const look = lookup(`
            export interface City { slug: string; name: string; state: string | null; updatedAt?: string }
            export interface Paged<T> { items: T[]; total: number }`);
        const names = (claim: { fields?: { name: string; optional: boolean }[] }) => claim.fields?.map((f) => `${f.name}${f.optional ? "?" : ""}`);
        expect(names(genericClaim("City", look))).toEqual(["slug", "name", "state", "updatedAt?"]);
        expect(names(genericClaim("City[]", look))).toEqual(["slug", "name", "state", "updatedAt?"]);
        expect(names(genericClaim("City | null", look))).toEqual(["slug", "name", "state", "updatedAt?"]);
        expect(names(genericClaim("Paged<City>", look))).toEqual(["items", "total"]);
        expect(names(genericClaim("{ message: string; at?: string }", look))).toEqual(["message", "at?"]);
        expect(names(genericClaim("City & { partnerId: string }", look))).toEqual(["slug", "name", "state", "updatedAt?", "partnerId"]);
        expect(genericClaim("unknown", look)).toEqual({ skip: "the generic `unknown` claims nothing" });
        expect(genericClaim("Partial<City>", look)).toMatchObject({ unverifiable: expect.stringContaining("utility type") });
        expect(genericClaim("T", look)).toMatchObject({ unverifiable: expect.stringContaining("names no interface") });
        expect(genericClaim("Nope", look)).toMatchObject({ unverifiable: expect.stringContaining("Nope is not an interface") });
        expect(genericClaim(null, look)).toEqual({ unverifiable: "the call names no response type" });
    });

    it("fails a required field the backend's response never carries — the City id — and passes once it is gone or optional", () => {
        const withId = {
            "services/cities.ts": `
                export interface City { id: string; slug: string; name: string; state: string | null; aliases: string[]; isActive: boolean; updatedAt?: string }
                export const citiesService = { list: () => http.get<City[]>("/pricing/cities") };`,
        };
        const bad = auditResponses(withId, responseRoutes, indexBackend(backend, parseModels(schema)));
        expect(bad.problems).toEqual([
            "services/cities.ts:3: GET /pricing/cities answers City, but the backend's response (listCitiesHandler) never carries [id] — drop the field or make it optional",
        ]);
        const fixed = { "services/cities.ts": withId["services/cities.ts"].replace("id: string;", "id?: string;") };
        const good = auditResponses(fixed, responseRoutes, indexBackend(backend, parseModels(schema)));
        expect(good.problems).toEqual([]);
        expect(good.checked).toBe(1);
        expect(good.fields).toBe(5);
    });

    it("resolves the interface through a sibling service, a types file and the types index, and counts the rest as unverifiable or claiming nothing", () => {
        const services = {
            "services/imports.ts": `
                import type { PartyImport } from "./party-imports";
                import type { Venue } from "@/types/pricing";
                import type { Summary } from "@/types";
                export const s = {
                    a: () => http.get<PartyImport>("/publishers/imports/x"),
                    b: () => http.get<Venue[]>("/pricing/venues"),
                    c: () => http.get<Summary[]>("/party-imports/advertisers/summary"),
                    d: () => http.get<unknown>("/pricing/cities"),
                    e: () => http.get<Partial<PartyImport>>("/publishers/imports"),
                    f: () => http.get("/pricing/cities"),
                    g: () => http.get<PartyImport>("/not/in/the/inventory"),
                };`,
            "services/party-imports.ts": `export interface PartyImport { id: string; fileName: string; rows?: unknown[]; party: string }`,
        };
        const types = { "types/pricing.ts": `export interface Venue { id: string; name: string }`, "types/summary.ts": `export interface Summary { label: string }` };
        const result = auditResponses(services, responseRoutes, indexBackend(backend, parseModels(schema)), types);
        expect(result.problems).toEqual([
            "services/imports.ts:6: GET /publishers/imports/x answers PartyImport, but the backend's response (getImportHandler) never carries [party] — drop the field or make it optional",
        ]);
        expect(result.checked).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.unverifiable).toEqual([
            "services/imports.ts:7: GET /pricing/venues — listVenuesHandler: a branch of the response could not be followed to a select, mapper or object literal",
            "services/imports.ts:8: GET /party-imports/advertisers/summary — summaryHandler: the response is built with a spread or an unresolved select/include",
            "services/imports.ts:10: GET /publishers/imports — the generic `Partial<PartyImport>` is a utility type the script cannot read",
            "services/imports.ts:11: GET /pricing/cities — the call names no response type",
        ]);
    });
});

describe("checkContract", () => {
    it("runs the response audit when a backend is handed in, and matches known debt with the line number ignored", () => {
        const services = {
            "services/cities.ts": `
                export interface City { id: string; slug: string }
                export const citiesService = { list: () => http.get<City[]>("/pricing/cities") };`,
        };
        const finding = "services/cities.ts:3: GET /pricing/cities answers City, but the backend's response (listCitiesHandler) never carries [id] — drop the field or make it optional";
        const failing = checkContract({ services, types: {}, routes: responseRoutes, schema, backend, registry: {}, allowed: [], knownDebt: [] });
        expect(failing.problems).toEqual([finding]);
        const moved = finding.replace("cities.ts:3:", "cities.ts:9:");
        const excused = checkContract({ services, types: {}, routes: responseRoutes, schema, backend, registry: {}, allowed: [], knownDebt: [moved] });
        expect(excused.problems).toEqual([]);
        expect(excused.debt).toEqual([finding]);
        expect(excused.results.responses.checked).toBe(1);
        // Without a backend the audit is absent, and says so rather than counting zero.
        expect(checkContract({ services, types: {}, routes: responseRoutes, schema, registry: {}, allowed: [], knownDebt: [] }).results.responses).toMatchObject({ absent: true, problems: [] });
    });

    it("separates known debt from problems, and fails a debt entry that no longer reproduces", () => {
        const services = { "services/a.ts": `http.get("/supply/claims"); http.get("/gone");` };
        const types = { "types/t.ts": `export type ListingClaimStatus = "pending" | "approved";` };
        const debt = ["types/t.ts: ListingClaimStatus is a lowercase union mirroring enum ListingClaimStatus (pending, approved) — vocabulary belongs in services/, not types/", "services/a.ts:1: GET /fixed is not in the backend's route inventory"];
        const { problems, debt: printed } = checkContract({ services, types, routes, schema, registry: {}, allowed: [], knownDebt: debt });
        expect(printed).toEqual([debt[0]]);
        expect(problems).toEqual([
            "services/a.ts:1: GET /gone is not in the backend's route inventory",
            `known debt no longer reproduces — remove it from KNOWN_DEBT: ${debt[1]}`,
        ]);
    });
});
