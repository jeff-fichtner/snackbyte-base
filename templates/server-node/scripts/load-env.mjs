/**
 * Loads .env into process.env with variable expansion, for local development only.
 * Production reads real environment variables injected by the platform; this file is
 * imported by the dev and build scripts, never by anything that runs in production.
 *
 * The .env is this project's own, or, inside an app with several parts, the app's one .env in the
 * folder above (see lib/find-up-one.mjs). With neither, nothing is loaded; a value the project
 * needs then fails where it is needed.
 *
 * .env is committed. It holds plain local config, and any secret it carries is a 1Password
 * reference (op://…) that only `op run --env-file=.env -- <cmd>` resolves: op run puts the
 * resolved value in the environment first and dotenv never overrides an existing variable.
 * Started without op run, a reference would reach the app as a literal credential; the guard
 * below stops at startup instead, naming the variables and the command to use.
 *
 * The image build never sees .env (the image's ignore file keeps every .env* out of the context),
 * so dotenv finds nothing there and the guard has nothing to stop.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import { assertNoOpReferences } from './lib/env-guard.mjs';
import { findUpOne } from './lib/find-up-one.mjs';

const envFile = findUpOne('.env').found;
if (envFile) {
  expand(dotenv.config({ path: envFile, quiet: true }));
}

const npmScript = process.env.npm_lifecycle_event;
const command = npmScript
  ? `npm run ${npmScript}`
  : `node ${path.relative(process.cwd(), process.argv[1])}`;
const envFileName = envFile ? path.relative(process.cwd(), envFile) || '.env' : '.env';
assertNoOpReferences(process.env, `op run --env-file=${envFileName} -- ${command}`);
