// Reads only PORT before delegating to Next.js. Next itself remains responsible
// for loading every other environment variable with its normal precedence and
// expansion rules.
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

function readPort(file) {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^PORT\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    return value;
  }
  return undefined;
}

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);

function cliPort(commandArgs) {
  for (let index = 0; index < commandArgs.length; index += 1) {
    const arg = commandArgs[index];
    if (arg === '--port' || arg === '-p') return commandArgs[index + 1];
    if (arg.startsWith('--port=')) return arg.slice('--port='.length);
  }
  return undefined;
}

const portValue =
  cliPort(args) ??
  process.env.PORT ??
  readPort(path.join(root, '.env.local')) ??
  readPort(path.join(root, '.env')) ??
  '5173';
const port = Number(portValue);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[frontend] Invalid PORT value: ${JSON.stringify(portValue)}`);
  process.exit(1);
}

process.env.PORT = String(port);

// Supplying an explicit port makes Next fail instead of silently choosing a
// different one, which otherwise leaves the browser pointed at a stale server.
if ((args[0] === 'dev' || args[0] === 'start') && cliPort(args) === undefined) {
  args.push('--port', String(port));
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(port, () => probe.close(resolve));
  });
}

async function main() {
  if (args[0] === 'dev' || args[0] === 'start') {
    try {
      await assertPortAvailable();
    } catch (error) {
      if (error && error.code === 'EADDRINUSE') {
        console.error(
          `[frontend] Port ${port} is already in use. Stop the existing frontend ` +
            `with Ctrl+C, or run "npm run dev -- --port ${port + 1}".`,
        );
        process.exit(1);
      }
      throw error;
    }
  }

  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, ...args], {
    stdio: 'inherit',
    env: process.env,
  });

  child.once('error', (error) => {
    console.error('[frontend] Failed to launch Next.js:', error);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error('[frontend] Startup check failed:', error);
  process.exit(1);
});
