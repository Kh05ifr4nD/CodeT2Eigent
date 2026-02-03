import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  type AppError as UpdaterError,
  appError as error,
} from "../common/error.ts";
import { readEnv } from "../common/env.ts";
import { writeJsonFile } from "../common/json.ts";
import {
  fetchGitHubFileText,
  fetchGitHubLatestRelease,
  fetchNpmLatestVersion,
} from "./http.ts";
import {
  groupOutputHashKeysByDrvName,
  parseGitDependenciesFromCargoLock,
} from "./cargoLock.ts";
import {
  fakeSha256Hash,
  inferCargoHashFromBuild,
  inferFixedOutputHashMismatchFromBuild,
  prefetchFileHash,
} from "./nix.ts";
import { readHashJsonVersion } from "./hashJson.ts";

function logLine(message: string): Effect.Effect<void, UpdaterError> {
  return Effect.sync(() => {
    console.error(message);
  });
}

type GitHubTagConfig = Readonly<{
  owner: string;
  repo: string;
  tagPrefix: string;
}>;

export type TarballConfig = Readonly<{
  owner: string;
  repo: string;
  tagPrefix: string;
  hashPath: URL;
  cargo?:
    | Readonly<{ kind: "cargoHash" }>
    | Readonly<{ kind: "cargoLock"; lockFilePath: string }>;
}>;

type AssetEntry = Readonly<[platform: string, asset: string]>;

export type AssetsConfig = Readonly<{
  owner: string;
  repo: string;
  tagPrefix: string;
  hashPath: URL;
  assets: ReadonlyArray<AssetEntry>;
}>;

export type NpmConfig = Readonly<{
  packageName: string;
  hashPath: URL;
}>;

export type PackageConfig =
  | Readonly<{ kind: "github-tarball"; config: TarballConfig }>
  | Readonly<{ kind: "github-assets"; config: AssetsConfig }>
  | Readonly<{ kind: "npm-tarball"; config: NpmConfig }>;

function tagToVersion(
  tag: string,
  config: GitHubTagConfig,
): Effect.Effect<string, UpdaterError> {
  if (!tag.startsWith(config.tagPrefix)) {
    return Effect.fail(error.invalidTagPrefix(tag, config.tagPrefix));
  }
  const version = tag.slice(config.tagPrefix.length);
  if (version.length === 0) {
    return Effect.fail(error.invalidTagEmptyVersion(tag));
  }
  return Effect.succeed(version);
}

function githubTarballUrl(owner: string, repo: string, tag: string): string {
  return `https://github.com/${owner}/${repo}/archive/refs/tags/${tag}.tar.gz`;
}

export function updateGithubReleaseTarball(
  name: string,
  config: TarballConfig,
): Effect.Effect<void, UpdaterError> {
  const token = readEnv("GITHUB_TOKEN");
  return Effect.flatMap(
    fetchGitHubLatestRelease(config.owner, config.repo, token),
    (tag: string) =>
      Effect.flatMap(
        tagToVersion(tag, config),
        (version: string) =>
          Effect.flatMap(
            readHashJsonVersion(config.hashPath),
            (currentVersion) => {
              if (version === currentVersion) {
                return logLine(`${name}: already up to date (${version})`);
              }

              const url = githubTarballUrl(config.owner, config.repo, tag);
              const basePayload = { version, hash: "" };

              return Effect.flatMap(
                logLine(`Prefetching source: ${url}`),
                () =>
                  Effect.flatMap(
                    prefetchFileHash(url, { unpack: true }),
                    (hash: string) => {
                      if (!config.cargo) {
                        return Effect.flatMap(
                          writeJsonFile(config.hashPath, {
                            ...basePayload,
                            hash,
                          }),
                          () =>
                            logLine(
                              `Updated ${config.hashPath.pathname} to ${version}`,
                            ),
                        );
                      }

                      if (config.cargo.kind === "cargoHash") {
                        return Effect.flatMap(
                          writeJsonFile(config.hashPath, {
                            ...basePayload,
                            hash,
                            cargoHash: fakeSha256Hash,
                          }),
                          () =>
                            Effect.flatMap(
                              inferCargoHashFromBuild(name, fakeSha256Hash),
                              (cargoHash) =>
                                cargoHash === fakeSha256Hash
                                  ? logLine(
                                    `Updated ${config.hashPath.pathname} to ${version} (cargoHash unchanged)`,
                                  )
                                  : Effect.flatMap(
                                    writeJsonFile(config.hashPath, {
                                      ...basePayload,
                                      hash,
                                      cargoHash,
                                    }),
                                    () =>
                                      logLine(
                                        `Updated ${config.hashPath.pathname} to ${version}`,
                                      ),
                                  ),
                            ),
                        );
                      }

                      const lockFilePath = config.cargo.lockFilePath;
                      const maxIterations = 32;

                      return Effect.flatMap(
                        fetchGitHubFileText(
                          config.owner,
                          config.repo,
                          lockFilePath,
                          tag,
                          token,
                        ),
                        (cargoLockText) => {
                          const gitDeps = parseGitDependenciesFromCargoLock(
                            cargoLockText,
                          );
                          const drvNameToKeys = groupOutputHashKeysByDrvName(
                            gitDeps,
                          );
                          const keys = Object.values(drvNameToKeys)
                            .flatMap((value) => value)
                            .slice()
                            .sort();
                          const baseOutputHashes = Object.fromEntries(
                            keys.map((key) => [key, fakeSha256Hash] as const),
                          );

                          const resolveOutputHashes = (
                            outputHashes: Readonly<Record<string, string>>,
                            remaining: number,
                          ): Effect.Effect<void, UpdaterError> => {
                            if (remaining <= 0) {
                              return Effect.fail(
                                error.invalidJson(
                                  `${name}: exceeded maximum iterations while inferring output hashes`,
                                ),
                              );
                            }

                            return Effect.flatMap(
                              inferFixedOutputHashMismatchFromBuild(name),
                              (mismatch) => {
                                if (Option.isNone(mismatch)) {
                                  return Effect.flatMap(
                                    writeJsonFile(config.hashPath, {
                                      ...basePayload,
                                      hash,
                                      outputHashes,
                                    }),
                                    () =>
                                      logLine(
                                        `Updated ${config.hashPath.pathname} to ${version}`,
                                      ),
                                  );
                                }

                                const keysForDrv = drvNameToKeys[
                                  mismatch.value.drvName
                                ];
                                if (!keysForDrv) {
                                  return Effect.fail(
                                    error.commandNonZeroExit(
                                      [
                                        "nix",
                                        "build",
                                        `.#${name}`,
                                        "--no-link",
                                      ],
                                      1,
                                      "",
                                      `Unknown fixed-output derivation: ${mismatch.value.drvName}`,
                                    ),
                                  );
                                }

                                const next: Record<string, string> = {
                                  ...outputHashes,
                                };
                                for (const key of keysForDrv) {
                                  next[key] = mismatch.value.hash;
                                }

                                return Effect.flatMap(
                                  writeJsonFile(config.hashPath, {
                                    ...basePayload,
                                    hash,
                                    outputHashes: next,
                                  }),
                                  () =>
                                    resolveOutputHashes(next, remaining - 1),
                                );
                              },
                            );
                          };

                          return Effect.flatMap(
                            writeJsonFile(config.hashPath, {
                              ...basePayload,
                              hash,
                              outputHashes: baseOutputHashes,
                            }),
                            () =>
                              resolveOutputHashes(
                                baseOutputHashes,
                                maxIterations,
                              ),
                          );
                        },
                      );
                    },
                  ),
              );
            },
          ),
      ),
  );
}

export function updateGithubReleaseAssets(
  name: string,
  config: AssetsConfig,
): Effect.Effect<void, UpdaterError> {
  const token = readEnv("GITHUB_TOKEN");
  return Effect.flatMap(
    fetchGitHubLatestRelease(config.owner, config.repo, token),
    (tag: string) =>
      Effect.flatMap(
        tagToVersion(tag, config),
        (version: string) =>
          Effect.flatMap(
            readHashJsonVersion(config.hashPath),
            (currentVersion) => {
              if (version === currentVersion) {
                return logLine(`${name}: already up to date (${version})`);
              }

              return Effect.flatMap(
                Effect.forEach(config.assets, (entry: AssetEntry) => {
                  const [platform, asset] = entry;
                  const url =
                    `https://github.com/${config.owner}/${config.repo}/releases/download/${tag}/${asset}`;
                  return Effect.flatMap(
                    logLine(`Prefetching ${platform}: ${url}`),
                    () =>
                      Effect.map(prefetchFileHash(url), (hash: string) =>
                        [
                          platform,
                          hash,
                        ] as const),
                  );
                }),
                (pairs: ReadonlyArray<readonly [string, string]>) => {
                  const hashes = Object.fromEntries(pairs);
                  return Effect.flatMap(
                    writeJsonFile(config.hashPath, { version, hashes }),
                    () =>
                      logLine(
                        `Updated ${config.hashPath.pathname} to ${version}`,
                      ),
                  );
                },
              );
            },
          ),
      ),
  );
}

export function updateNpmTarball(
  name: string,
  config: NpmConfig,
): Effect.Effect<void, UpdaterError> {
  return Effect.flatMap(
    fetchNpmLatestVersion(config.packageName),
    (version: string) =>
      Effect.flatMap(readHashJsonVersion(config.hashPath), (currentVersion) => {
        if (version === currentVersion) {
          return logLine(`${name}: already up to date (${version})`);
        }

        const url =
          `https://registry.npmjs.org/${config.packageName}/-/${config.packageName}-${version}.tgz`;
        return Effect.flatMap(
          logLine(`Prefetching source: ${url}`),
          () =>
            Effect.flatMap(
              prefetchFileHash(url, { unpack: true }),
              (hash: string) =>
                Effect.flatMap(
                  writeJsonFile(config.hashPath, { version, hash }),
                  () =>
                    logLine(
                      `Updated ${config.hashPath.pathname} to ${version}`,
                    ),
                ),
            ),
        );
      }),
  );
}
