// Types for deploy-proof.mjs, so the hub's TypeScript tests can import the plain-JS module.

export declare function parseFlags(
  argv: string[],
  required: string[],
  optional?: string[],
): Record<string, string>;

export declare function checkApp(target: {
  url: string;
  env: string;
  tag: string;
  noindex: boolean;
  headers?: Record<string, string>;
}): Promise<string[]>;
