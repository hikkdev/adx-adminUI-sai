// Loads .env / .env.local into process.env, then delegates to the Next.js CLI.
//
// Next only reads .env files once its own dev/prod server starts — by then the
// CLI has already picked a port (via commander's `-p/--port` option, which
// falls back to whatever PORT happens to already be in process.env). So PORT
// set in .env has no effect unless something loads it before `next` runs.
// This script is that something, letting PORT be controlled from .env like
// every other var here instead of hardcoded in package.json.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = path.join(__dirname, '..');
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const nextBin = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
