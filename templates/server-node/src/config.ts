/**
 * Runtime configuration, read from the environment.
 *
 * Single source of truth for values that vary by environment. In production these
 * come from the platform (e.g. Cloud Run injects PORT); in local development they
 * can be set in a .env file (loaded by the dev/build scripts).
 */

/**
 * Reads PORT. Unset, it is 8080. That default cannot cause wrong behaviour:
 * - In production it never applies: Cloud Run always injects PORT, and the image also sets
 *   PORT=8080 (Dockerfile). A server listening on any port but the injected one fails Cloud
 *   Run's startup probe, so the deploy fails instead of serving.
 * - Locally the committed .env sets PORT=8080 for `npm run dev` and `npm run build`. The
 *   commands that read this module without .env (`npm test`, `npm start`, `vite preview`) get
 *   the same 8080, the value every environment uses, and the server and the dev proxy both
 *   read it from this module, so they always agree.
 *
 * Set, it must be a whole number from 1 to 65535, and anything else stops startup with an
 * error naming PORT. A blank value is the case this guards: `Number('')` is 0, so the server
 * would listen on a random port while the log and the dev proxy said 0.
 */
export function readPort(raw: string | undefined): number {
  if (raw === undefined) {
    return 8080;
  }
  const port = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535, got ${JSON.stringify(raw)}.`);
  }
  return port;
}

/** Port the server listens on and the dev proxy targets. */
export const PORT = readPort(process.env.PORT);
