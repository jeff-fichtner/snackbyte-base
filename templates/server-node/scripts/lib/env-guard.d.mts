// Types for env-guard.mjs, so TypeScript tests can import the plain-JS module.

export declare const OP_REFERENCE_PREFIX: string;

export declare function assertNoOpReferences(
  env: Record<string, string | undefined>,
  runCommand: string,
): void;

export interface RawValueFinding {
  line: number;
  key: string | null;
  reason: string;
}

export declare function findRawValues(text: string): RawValueFinding[];

export declare function isCheckedEnvFile(path: string): boolean;
