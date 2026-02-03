import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, appError } from "../common/error.ts";
import { readJsonFile } from "../common/json.ts";
import {
  asArray,
  getNumberField,
  getStringField,
  type JsonObject,
  type JsonValue,
  requireField,
  requireNonEmptyStringField,
  requireObjectField,
  requireObjectValue,
} from "../common/jsonValue.ts";
import { defaultCommandOptions, runCommand } from "../common/command.ts";
import { gitHasChanges } from "./git.ts";
import { readHashJsonVersion } from "../updater/hashJson.ts";
import {
  type PackageConfig,
  updateGithubReleaseAssets,
  updateGithubReleaseTarball,
  updateNpmTarball,
} from "../updater/packages.ts";
import { discoverPackageConfigs } from "../updater/registry.ts";

export type MatrixEntry = Readonly<{
  type: "package" | "flake-input";
  name: string;
  currentVersion: string;
}>;

type UpdateResult = Readonly<{ next: string; updated: boolean }>;

function updateResult(next: string, updated: boolean): UpdateResult {
  return { next, updated };
}

const nixEnv = { NIX_PATH: "nixpkgs=flake:nixpkgs" };

function nixOptions(
  extraEnv: Readonly<Record<string, string>> = {},
): typeof defaultCommandOptions {
  return {
    ...defaultCommandOptions,
    env: { ...nixEnv, ...extraEnv },
  };
}

function updateConfiguredPackage(
  name: string,
  entry: PackageConfig,
): Effect.Effect<void, AppError> {
  if (entry.kind === "github-tarball") {
    return updateGithubReleaseTarball(name, entry.config);
  }
  if (entry.kind === "github-assets") {
    return updateGithubReleaseAssets(name, entry.config);
  }
  return updateNpmTarball(name, entry.config);
}

export function discoverPackages(
  packagesFilter: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<MatrixEntry>, AppError> {
  return Effect.flatMap(discoverPackageConfigs(), (packageConfigs) => {
    const allNames = Object.keys(packageConfigs).sort();
    const requested = packagesFilter.length > 0
      ? packagesFilter.slice().sort()
      : allNames;
    const unrecognizedPackages = requested.filter((name) =>
      !Object.hasOwn(packageConfigs, name)
    );

    if (unrecognizedPackages.length > 0) {
      return Effect.fail(appError.unrecognizedPackages(unrecognizedPackages));
    }

    return Effect.forEach(requested, (name) => {
      const entry = packageConfigs[name];
      if (!entry) {
        return Effect.fail(appError.unrecognizedPackage(name));
      }

      return Effect.map(
        readHashJsonVersion(entry.config.hashPath),
        (currentVersion) => ({
          type: "package",
          name,
          currentVersion,
        } as const),
      );
    });
  });
}

export function discoverInputs(
  inputsFilter: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<MatrixEntry>, AppError> {
  return Effect.flatMap(
    readFlakeLockModel(),
    ({ nodes, rootNodeName, rootInputs }) => {
      const requested = inputsFilter.length > 0
        ? inputsFilter.slice().sort()
        : Object.keys(rootInputs).sort();
      return Effect.forEach(requested, (inputName) =>
        Effect.map(
          readFlakeInputVersionFromModel(
            nodes,
            rootNodeName,
            rootInputs,
            inputName,
          ),
          (version) => ({
            type: "flake-input",
            name: inputName,
            currentVersion: version,
          } as const),
        ));
    },
  );
}

export function buildMatrix(
  packages: ReadonlyArray<string>,
  inputs: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<MatrixEntry>, AppError> {
  return Effect.flatMap(
    Effect.all([discoverPackages(packages), discoverInputs(inputs)]),
    ([pkg, inp]) => Effect.succeed([...pkg, ...inp]),
  );
}

export function updatePackage(
  name: string,
  currentVersion: string,
): Effect.Effect<UpdateResult, AppError> {
  return Effect.flatMap(discoverPackageConfigs(), (packageConfigs) => {
    const entry = packageConfigs[name];
    if (!entry) {
      return Effect.fail(appError.unrecognizedPackage(name));
    }

    const hashPath = entry.config.hashPath;
    return Effect.flatMap(
      updateConfiguredPackage(name, entry),
      () =>
        Effect.flatMap(gitHasChanges(), (changed) => {
          if (!changed) {
            return Effect.succeed(updateResult(currentVersion, false));
          }
          return Effect.map(
            readHashJsonVersion(hashPath),
            (next) => updateResult(next, true),
          );
        }),
    );
  });
}

type FlakeLockModel = Readonly<{
  nodes: JsonObject;
  rootNodeName: string;
  rootInputs: JsonObject;
}>;

function readFlakeLockModel(): Effect.Effect<FlakeLockModel, AppError> {
  return Effect.flatMap(
    readJsonFile("flake.lock"),
    (json) =>
      Effect.flatMap(
        requireObjectValue(json, "flake.lock"),
        (lock) =>
          Effect.flatMap(
            Effect.all([
              requireObjectField(lock, "nodes", "flake.lock"),
              requireNonEmptyStringField(lock, "root", "flake.lock"),
            ]),
            ([nodes, rootNodeName]) =>
              Effect.flatMap(
                requireObjectField(nodes, rootNodeName, "flake.lock.nodes"),
                (rootNode) =>
                  Effect.map(
                    requireObjectField(
                      rootNode,
                      "inputs",
                      `flake.lock.nodes.${rootNodeName}`,
                    ),
                    (
                      rootInputs,
                    ) => ({ nodes, rootNodeName, rootInputs } as const),
                  ),
              ),
          ),
      ),
  );
}

function resolveFlakeInputNodeName(
  reference: JsonValue,
  context: string,
): Effect.Effect<string, AppError> {
  if (typeof reference === "string" && reference.length > 0) {
    return Effect.succeed(reference);
  }

  return Option.match(asArray(reference), {
    onNone: () =>
      Effect.fail(appError.flakeLockInvalidInputRef(context, reference)),
    onSome: (array) => {
      if (array.length === 0) {
        return Effect.fail(
          appError.flakeLockInvalidInputRef(context, reference),
        );
      }
      const last = array[array.length - 1] as JsonValue;
      if (typeof last !== "string" || last.length === 0) {
        return Effect.fail(
          appError.flakeLockInvalidInputRef(context, reference),
        );
      }
      return Effect.succeed(last);
    },
  });
}

function lockedVersion(
  locked: JsonObject,
  context: string,
): Effect.Effect<string, AppError> {
  const rev = getStringField(locked, "rev");
  if (Option.isSome(rev) && rev.value.length > 0) {
    return Effect.succeed(rev.value.slice(0, 8));
  }

  const narHash = getStringField(locked, "narHash");
  if (Option.isSome(narHash) && narHash.value.length > 0) {
    return Effect.succeed(narHash.value);
  }

  const lastModified = getNumberField(locked, "lastModified");
  if (Option.isSome(lastModified)) {
    return Effect.succeed(String(lastModified.value));
  }

  return Effect.fail(
    appError.jsonMissingField(
      context,
      "rev/narHash/lastModified",
      Object.keys(locked).sort(),
    ),
  );
}

function readFlakeInputVersionFromModel(
  nodes: JsonObject,
  rootNodeName: string,
  rootInputs: JsonObject,
  inputName: string,
): Effect.Effect<string, AppError> {
  const context = `flake.lock.nodes.${rootNodeName}.inputs`;
  return Effect.flatMap(
    requireField(rootInputs, inputName, context),
    (inputRef) =>
      Effect.flatMap(
        resolveFlakeInputNodeName(inputRef, `${context}.${inputName}`),
        (nodeName) =>
          Effect.flatMap(
            requireObjectField(nodes, nodeName, "flake.lock.nodes"),
            (node) =>
              Effect.flatMap(
                requireObjectField(
                  node,
                  "locked",
                  `flake.lock.nodes.${nodeName}`,
                ),
                (locked) =>
                  lockedVersion(locked, `flake.lock.nodes.${nodeName}.locked`),
              ),
          ),
      ),
  );
}

function readFlakeInputVersion(
  inputName: string,
): Effect.Effect<string, AppError> {
  return Effect.flatMap(
    readFlakeLockModel(),
    ({ nodes, rootNodeName, rootInputs }) =>
      readFlakeInputVersionFromModel(
        nodes,
        rootNodeName,
        rootInputs,
        inputName,
      ),
  );
}

export function updateInput(
  name: string,
  currentVersion: string,
): Effect.Effect<UpdateResult, AppError> {
  return Effect.flatMap(
    runCommand(["nix", "flake", "update", name], nixOptions()),
    () =>
      Effect.flatMap(gitHasChanges(), (changed) => {
        if (!changed) {
          return Effect.succeed(updateResult(currentVersion, false));
        }
        return Effect.map(readFlakeInputVersion(name), (next) =>
          updateResult(next, true));
      }),
  );
}
