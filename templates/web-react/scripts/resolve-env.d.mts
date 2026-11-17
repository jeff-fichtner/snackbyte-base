// Types for resolve-env.mjs, so TypeScript tests can import the plain-JS module.

export interface BuildEnv {
  name: string;
  isPublicFace: boolean;
  noindex: boolean;
}

export declare const LOCAL: BuildEnv;

export declare function manifestPath(root?: string): string;

export declare function resolveBuildEnv(root?: string): BuildEnv;
