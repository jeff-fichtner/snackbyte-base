// The C# server's .NET release is one setting, the SDK version in its global.json. The image recipe
// the hub gives a C# app names the same release for its SDK and runtime images.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers';

const globalJson = JSON.parse(
  readFileSync(join(repoRoot, 'templates/server-dotnet/global.json'), 'utf8'),
) as { sdk: { version: string } };
const dockerfile = readFileSync(join(repoRoot, 'hub/files/Dockerfile.dotnet'), 'utf8');

describe('the .NET release', () => {
  const release = /^(\d+\.\d+)\.\d+$/.exec(globalJson.sdk.version)?.[1];

  it('is named by the SDK version in global.json', () => {
    expect(release, globalJson.sdk.version).toBeDefined();
  });

  it('is the release the C# image recipe builds and runs on', () => {
    expect(/^ARG DOTNET_RELEASE=(.+)$/m.exec(dockerfile)?.[1]).toBe(release);
    const images = [...dockerfile.matchAll(/^FROM mcr\.microsoft\.com\/dotnet\/(\S+)/gm)].map(
      (match) => match[1],
    );
    expect(images).toEqual(['sdk:${DOTNET_RELEASE}', 'aspnet:${DOTNET_RELEASE}']);
  });
});
