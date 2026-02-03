import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  type AppError as UpdaterError,
  appError as error,
} from "../common/error.ts";
import { readJsonFile } from "../common/json.ts";
import {
  getObjectField,
  type JsonObject,
  type JsonValue,
  requireArrayField,
  requireNonEmptyStringField,
  requireObjectValue,
} from "../common/jsonValue.ts";
import type {
  AssetsConfig,
  NpmConfig,
  PackageConfig,
  TarballConfig,
} from "./packages.ts";

type CargoConfig =
  | Readonly<{ kind: "cargoHash" }>
  | Readonly<{ kind: "cargoLock"; lockFilePath: string }>;

const updaterConfigFilename = "updater.json";
const pkgsRoot = "pkgs";

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function basename(pathValue: string): string {
  const parts = pathValue.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return typeof last === "string" && last.length > 0 ? last : "";
}

function dirname(pathValue: string): string {
  const index = pathValue.lastIndexOf("/");
  return index < 0 ? "" : pathValue.slice(0, index);
}

function repoRootUrl(): URL {
  return new URL("../../", import.meta.url);
}

function pkgsRootPath(): string {
  return new URL(`${pkgsRoot}/`, repoRootUrl()).pathname;
}

function walkUpdaterConfigPaths(): Effect.Effect<
  ReadonlyArray<string>,
  UpdaterError
> {
  return Effect.async((resume) => {
    const run = async (): Promise<void> => {
      const results: string[] = [];
      const stack: string[] = [pkgsRootPath()];

      while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir) {
          continue;
        }

        for await (const entry of Deno.readDir(dir)) {
          const path = joinPath(dir, entry.name);
          if (entry.isDirectory) {
            stack.push(path);
            continue;
          }
          if (entry.isFile && entry.name === updaterConfigFilename) {
            results.push(path);
          }
        }
      }

      results.sort();
      resume(Effect.succeed(results));
    };

    run().catch((reason: unknown) => {
      resume(
        Effect.fail(
          error.ioReadFailed(
            pkgsRoot,
            reason instanceof Error ? reason.message : String(reason),
          ),
        ),
      );
    });
  });
}

function requireAssetEntries(
  object: JsonObject,
  context: string,
): Effect.Effect<AssetsConfig["assets"], UpdaterError> {
  const assetsContext = `${context}.assets`;
  return Effect.flatMap(
    requireArrayField(object, "assets", context),
    (assets) => {
      const entries: Array<readonly [string, string]> = [];
      for (const value of assets) {
        if (!Array.isArray(value) || value.length !== 2) {
          return Effect.fail(
            error.invalidJson(
              `${assetsContext}: expected [platform, asset] pair, got ${
                JSON.stringify(value)
              }`,
            ),
          );
        }
        const platform = value[0];
        const asset = value[1];
        if (typeof platform !== "string" || platform.length === 0) {
          return Effect.fail(
            error.invalidJson(
              `${assetsContext}: invalid platform ${JSON.stringify(platform)}`,
            ),
          );
        }
        if (typeof asset !== "string" || asset.length === 0) {
          return Effect.fail(
            error.invalidJson(
              `${assetsContext}: invalid asset ${JSON.stringify(asset)}`,
            ),
          );
        }
        entries.push([platform, asset] as const);
      }
      return Effect.succeed(entries);
    },
  );
}

function requireCargoConfig(
  object: JsonObject,
  context: string,
): Effect.Effect<Option.Option<CargoConfig>, UpdaterError> {
  const cargoField = getObjectField(object, "cargo");
  if (Option.isNone(cargoField)) {
    return Effect.succeed(Option.none());
  }

  const cargoContext = `${context}.cargo`;
  return Effect.flatMap(
    requireNonEmptyStringField(cargoField.value, "kind", cargoContext),
    (kind): Effect.Effect<Option.Option<CargoConfig>, UpdaterError> => {
      if (kind === "cargoHash") {
        return Effect.succeed(Option.some({ kind: "cargoHash" } as const));
      }
      if (kind === "cargoLock") {
        return Effect.map(
          requireNonEmptyStringField(
            cargoField.value,
            "lockFilePath",
            cargoContext,
          ),
          (lockFilePath) =>
            Option.some({ kind: "cargoLock", lockFilePath } as const),
        );
      }
      return Effect.fail(
        error.invalidJson(
          `${cargoContext}: unrecognized kind ${JSON.stringify(kind)}`,
        ),
      );
    },
  );
}

function requireUpdaterConfig(
  json: JsonValue,
  configPath: string,
  hashPath: URL,
): Effect.Effect<PackageConfig, UpdaterError> {
  const context = configPath;
  return Effect.flatMap(
    requireObjectValue(json, context),
    (object) =>
      Effect.flatMap(
        requireNonEmptyStringField(object, "kind", context),
        (kind): Effect.Effect<PackageConfig, UpdaterError> => {
          if (kind === "github-tarball") {
            return Effect.flatMap(
              Effect.all([
                requireNonEmptyStringField(object, "owner", context),
                requireNonEmptyStringField(object, "repo", context),
                requireNonEmptyStringField(object, "tagPrefix", context),
                requireCargoConfig(object, context),
              ]),
              ([owner, repo, tagPrefix, cargo]) => {
                const base = { owner, repo, tagPrefix, hashPath } as const;
                const config = Option.isSome(cargo)
                  ? ({ ...base, cargo: cargo.value } satisfies TarballConfig)
                  : (base satisfies TarballConfig);
                return Effect.succeed(
                  { kind: "github-tarball", config } as const,
                );
              },
            );
          }

          if (kind === "github-assets") {
            return Effect.flatMap(
              Effect.all([
                requireNonEmptyStringField(object, "owner", context),
                requireNonEmptyStringField(object, "repo", context),
                requireNonEmptyStringField(object, "tagPrefix", context),
                requireAssetEntries(object, context),
              ]),
              ([owner, repo, tagPrefix, assets]) =>
                Effect.succeed(
                  {
                    kind: "github-assets",
                    config: {
                      owner,
                      repo,
                      tagPrefix,
                      hashPath,
                      assets,
                    } satisfies AssetsConfig,
                  } as const,
                ),
            );
          }

          if (kind === "npm-tarball") {
            return Effect.map(
              requireNonEmptyStringField(object, "packageName", context),
              (packageName) => ({
                kind: "npm-tarball",
                config: {
                  packageName,
                  hashPath,
                } satisfies NpmConfig,
              } as const),
            );
          }

          return Effect.fail(
            error.invalidJson(
              `${context}: unrecognized kind ${JSON.stringify(kind)}`,
            ),
          );
        },
      ),
  );
}

export function discoverPackageConfigs(): Effect.Effect<
  Readonly<Record<string, PackageConfig>>,
  UpdaterError
> {
  return Effect.flatMap(walkUpdaterConfigPaths(), (paths) => {
    const rootUrl = repoRootUrl();
    return Effect.flatMap(
      Effect.forEach(paths, (configPath) => {
        const configUrl = new URL(configPath, rootUrl);
        const hashPath = new URL("hash.json", configUrl);
        const pkgDir = dirname(configPath);
        const name = basename(pkgDir);
        if (name.length === 0) {
          return Effect.fail(
            error.invalidJson(
              `Unable to infer package name from ${JSON.stringify(configPath)}`,
            ),
          );
        }
        return Effect.map(
          Effect.flatMap(
            readJsonFile(configUrl),
            (json) => requireUpdaterConfig(json, configPath, hashPath),
          ),
          (config) => ({ name, config } as const),
        );
      }),
      (pairs) => {
        const out: Record<string, PackageConfig> = {};
        for (const { name, config } of pairs) {
          if (Object.hasOwn(out, name)) {
            return Effect.fail(
              error.invalidJson(`Duplicate package config name: ${name}`),
            );
          }
          out[name] = config;
        }
        return Effect.succeed(out);
      },
    );
  });
}
