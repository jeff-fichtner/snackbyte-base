// Types for manifest.mjs, so the hub's TypeScript tests can import the plain-JS module.

export declare function readRegistry(hubDir: string): {
  roles: Record<
    string,
    {
      flag: string | null;
      options: Record<string, { template: string; hasApi?: boolean; summary: string }>;
    }
  >;
};

export declare function manifestProblems(
  manifest: Record<string, unknown>,
  folderName: string,
): string[];

export declare function readManifest(
  templateDir: string,
  folderName: string,
): Record<string, unknown>;

export declare function inFolder(command: string, dir: string): string;
