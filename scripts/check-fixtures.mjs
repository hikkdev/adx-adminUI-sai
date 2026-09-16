/**
 * Fixture referential integrity.
 *
 * The console used to run on seeded data spread over a dozen files, and those
 * files pointed at each other by id. Nothing enforced that a `publisherId` in
 * `supply.ts` named a publisher that exists in `directory.ts` — and four of
 * them did not, so every one of those rows 404'd the moment it was clicked.
 * TypeScript cannot catch this: `string` is `string`.
 *
 * Every domain reads the API now and `src/data/` is empty (CE4). The guard
 * stays in `npm run lint` so that a fixture file added back — for a screen
 * someone wants to draw before its route exists — is checked the day it lands
 * rather than the day it 404s. With nothing under `src/data/` it passes and
 * says so.
 *
 * Run with `npm run check:fixtures`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: the repository path contains spaces, which
// pathname leaves percent-encoded.
const DATA_DIR = fileURLToPath(new URL('../src/data/', import.meta.url));

/**
 * Prefixes whose ids are owned by one file. A reference to `pub_999` anywhere
 * is a bug unless `directory.ts` defines it.
 */
const OWNERS = {
  pub_: 'directory.ts',
  adv_: 'directory.ts',
  agt_: 'directory.ts',
  cmp_: 'marketplace.ts',
  ord_: 'marketplace.ts',
};

/*
 * `usr_` is absent because the users domain is live: accounts.ts no longer
 * defines a user, and the `userId` a seeded publisher or ticket still carries
 * is a foreign key into a table the backend owns, not into a fixture file.
 * There is no /users/[id] fixture page left for it to 404 on.
 *
 * `lst_` and `att_` are deliberately absent. supply.ts legitimately defines its
 * own listings — inventory created inside a listing attempt that marketplace.ts
 * has never heard of — so a single-owner rule would report those as broken
 * every run. A guard that cries wolf gets switched off; this one only reports
 * prefixes with exactly one owner and a detail route to 404 on.
 */

const files = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter((name) => name.endsWith('.ts')) : [];

if (files.length === 0) {
  console.log('No fixture files under src/data — every domain reads the API.');
  process.exit(0);
}

/** `id: "pub_001"` — a definition. */
const DEFINITION = /\bid:\s*["'](\w+?_[0-9A-Za-z]+)["']/g;
/** `publisherId: "pub_001"` or a record key — a reference. */
const REFERENCE = /["'](\w+?_[0-9A-Za-z]+)["']/g;

const defined = new Map(); // id -> Set<file>, every file that defines it
const referenced = new Map(); // id -> Set<file>

for (const file of files) {
  const source = readFileSync(join(DATA_DIR, file), 'utf8');

  for (const [, id] of source.matchAll(DEFINITION)) {
    // Every definition, not just the first: readdir order is not guaranteed, so
    // keeping only the first would make the result depend on the filesystem.
    //
    // The same id appearing in several files is normal and not checked — a
    // funnel row is keyed by the publisher it projects. The invariant is only
    // that the owner file is among the definitions.
    if (!defined.has(id)) defined.set(id, new Set());
    defined.get(id).add(file);
  }
  for (const [, id] of source.matchAll(REFERENCE)) {
    if (!referenced.has(id)) referenced.set(id, new Set());
    referenced.get(id).add(file);
  }
}

const problems = [];

for (const [id, sources] of referenced) {
  const prefix = Object.keys(OWNERS).find((candidate) => id.startsWith(candidate));
  if (!prefix) continue;

  const owner = OWNERS[prefix];
  const definedIn = defined.get(id) ?? new Set();

  if (definedIn.size === 0) {
    problems.push(
      `${id} is referenced by ${[...sources].join(', ')} but defined nowhere. ` +
        `It should be in ${owner}.`,
    );
    continue;
  }

  if (!definedIn.has(owner)) {
    problems.push(
      `${id} is defined in ${[...definedIn].join(', ')} but not in ${owner}, ` +
        'which owns that prefix.',
    );
  }

}

if (problems.length > 0) {
  console.error('Fixture references do not resolve:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\n${problems.length} broken reference${problems.length === 1 ? '' : 's'}. ` +
      'A screen linking to one of these answers 404.',
  );
  process.exit(1);
}

const checked = [...referenced.keys()].filter((id) =>
  Object.keys(OWNERS).some((prefix) => id.startsWith(prefix)),
).length;

console.log(`Fixture references resolve (${checked} ids across ${files.length} files).`);
