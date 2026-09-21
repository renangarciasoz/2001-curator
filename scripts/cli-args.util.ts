/**
 * The arguments a script was invoked with, minus pnpm's separator.
 *
 * `pnpm run <script> -- --recreate` forwards the `--` literally, and Node's
 * `parseArgs` reads it as "everything after this is positional" — so the flag
 * arrives as a positional and the script either rejects it or, worse, ignores
 * it and runs with the wrong defaults.
 *
 * Dropping a leading `--` makes both invocations behave the same:
 *
 *   pnpm index:embeddings -- --recreate
 *   pnpm index:embeddings --recreate
 */
export function cliArgs(): readonly string[] {
  const args = process.argv.slice(2);

  return args[0] === '--' ? args.slice(1) : args;
}
