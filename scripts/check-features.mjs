/**
 * Every console screen belongs to a feature — Lot G (answer 144).
 *
 * `features.manifest.json` at the package root maps route-group paths under
 * `src/app/(admin)` to feature keys. This walks every `page.tsx` there and
 * fails when one sits under no declared path, and when a declared path
 * matches no page (a screen that was moved or deleted without the manifest
 * following). The backend's `npm run features:sync` folds the manifest into
 * `docs/feature-registry.json`, which is how Settings -> Feature flags lists
 * a console screen the moment it exists.
 *
 * Run with `npm run check:features`; `npm run lint` runs it too. The check
 * itself is `checkFeatures(pages, manifest)` — pure, so the test under
 * `src/lib/check-features.test.ts` can hand it a manifest and a page list
 * and read the problems back — and `main()` is the walk plus the exit code.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved when main() runs, not at import: the test imports this module
// through Vitest, whose module URLs are not file: URLs. fileURLToPath, not
// URL.pathname: the repository path contains spaces.
const root = () => fileURLToPath(new URL('..', import.meta.url));

/** `<area>.<capability>` — lower-case, dot-separated, hyphens allowed. The backend's `FEATURE_KEY`. */
export const KEY = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;
export const SURFACE = 'CONSOLE';

/** Every directory under `dir` holding a `page.tsx`, as a `/`-joined path relative to `dir`. */
export function pagesUnder(dir) {
  const walk = (current) => {
    const out = [];
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else if (entry.isFile() && entry.name === 'page.tsx') out.push(relative(dir, current).split(sep).join('/'));
    }
    return out;
  };
  return walk(dir).sort();
}

function under(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The check: every page under one declared path (the longest wins), every
 * declared path over at least one page, every key well-formed, the surface
 * CONSOLE. Returns the problems, one line each, and the counts the summary
 * prints.
 */
export function checkFeatures(pages, manifest) {
  const problems = [];

  if (manifest.surface !== SURFACE) problems.push(`surface must be ${SURFACE}, found ${manifest.surface}`);

  const declared = [];
  const features = manifest.features ?? {};
  for (const [key, entry] of Object.entries(features)) {
    if (!KEY.test(key)) problems.push(`"${key}" is not <area>.<capability>`);
    if (!Array.isArray(entry?.paths) || entry.paths.length === 0) problems.push(`"${key}" names no paths`);
    for (const path of entry?.paths ?? []) declared.push({ path, key });
  }
  declared.sort((a, b) => b.path.length - a.path.length);

  const seen = new Map();
  for (const { path, key } of declared) {
    const other = seen.get(path);
    if (other && other !== key) problems.push(`"${path}" is named by both "${other}" and "${key}"`);
    seen.set(path, key);
  }

  for (const page of pages) {
    const match = declared.find(({ path }) => under(page, path));
    if (!match) problems.push(`src/app/(admin)/${page}/page.tsx belongs to no feature — add its path to features.manifest.json`);
  }
  for (const { path, key } of declared) {
    if (!pages.some((page) => under(page, path))) {
      problems.push(`"${key}" names "${path}", which has no page under src/app/(admin) — the screen moved, or the manifest is stale`);
    }
  }

  return { problems, pages: pages.length, paths: declared.length, features: Object.keys(features).length };
}

export function main() {
  const manifest = JSON.parse(readFileSync(join(root(), 'features.manifest.json'), 'utf8'));
  const result = checkFeatures(pagesUnder(join(root(), 'src', 'app', '(admin)')), manifest);
  if (result.problems.length > 0) {
    console.error(`check-features: ${result.problems.length} problem(s)`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`check-features: ${result.pages} pages under ${result.paths} paths across ${result.features} features — all covered.`);
}

// Run only as a script; the test imports the check without walking the tree.
if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
