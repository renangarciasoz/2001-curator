/**
 * Runs a command with the variables from another env file layered on top.
 *
 *   node scripts/with-env.mjs .env.neon pnpm db:migrate:deploy
 *   pnpm prod pnpm db:migrate:deploy          # the same, shorter
 *
 * Why this exists: `.env` is the file everything reads by accident. Putting
 * production credentials there makes `pnpm dev` write to production and turns
 * the local database into scenery. Keeping them in `.env.neon` and loading it
 * only here makes reaching production a deliberate act with its own command —
 * and the banner below means you can never be unsure which one you just hit.
 *
 * The Prisma CLI only ever reads `.env`, so passing variables through the
 * process environment is the one mechanism that works for both Prisma and the
 * tsx scripts.
 *
 * Plain `.mjs`, not TypeScript: this is the launcher that starts everything
 * else, including Prisma. Making it depend on tsx would add a failure mode to
 * the one tool that has to work before anything else does.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [envFile, command, ...args] = process.argv.slice(2);

if (envFile === undefined || command === undefined) {
  console.error('uso: with-env.mjs <arquivo-env> <comando> [args...]');
  process.exit(2);
}

const overrides = readEnvFile(envFile);
const names = Object.keys(overrides);

if (names.length === 0) {
  console.error(`${envFile} não definiu nenhuma variável — abortando.`);
  process.exit(2);
}

// Loud on purpose: the whole point is never to hit production by accident.
console.error(`\n  ▸ ${envFile} → ${names.join(', ')}`);
console.error(`  ▸ ${[command, ...args].join(' ')}\n`);

/*
 * Run through a shell rather than exec'ing directly.
 *
 * `pnpm` is often a plain JS file rather than a native binary, and exec'ing one
 * fails with ENOEXEC — the shell knows how to run it, `execvp` does not. Node
 * joins an args array with bare spaces when `shell` is set, which would split
 * `--title "Os Sete Samurais"` into three arguments, so the command line is
 * quoted here instead of handed over as an array.
 */
const commandLine = [command, ...args].map(quoteForShell).join(' ');

const result = spawnSync(commandLine, {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, ...overrides },
});

// Without these two branches a failed spawn exits 1 having printed nothing at
// all, which is indistinguishable from the command itself failing quietly.
if (result.error !== undefined) {
  console.error(`\nnão consegui executar "${command}": ${result.error.message}`);
  process.exit(127);
}

if (result.signal !== null) {
  console.error(`\n"${command}" foi encerrado pelo sinal ${result.signal}`);
  process.exit(128);
}

process.exitCode = result.status ?? 1;

/** POSIX shell quoting: leave safe tokens bare, single-quote everything else. */
function quoteForShell(token) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) {
    return token;
  }

  return `'${token.replaceAll("'", "'\\''")}'`;
}

/** A deliberately small dotenv reader: `KEY=value`, `#` comments, blank lines. */
function readEnvFile(path) {
  let contents;

  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    console.error(`não consegui ler ${path}`);
    process.exit(2);
  }

  const values = {};

  for (const line of contents.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);

    if (match === null) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');

    // An empty value means "not filled in yet", not "override with nothing".
    if (value.length > 0) {
      values[key] = value;
    }
  }

  return values;
}
