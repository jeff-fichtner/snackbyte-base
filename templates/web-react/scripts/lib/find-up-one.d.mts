// Types for find-up-one.mjs, so TypeScript tests can import the plain-JS module.

export declare function findUpOne(
  name: string,
  root?: string,
): { found: string | undefined; candidates: string[] };
