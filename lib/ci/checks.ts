import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../common/error.ts";
import {
  type CommandOptions,
  defaultCommandOptions,
  runCommand,
} from "../common/command.ts";
import { packageConfigs } from "../updater/config.ts";

function inheritIo(options: CommandOptions): CommandOptions {
  return { ...options, stdout: "inherit", stderr: "inherit" };
}

function run(args: ReadonlyArray<string>): Effect.Effect<void, AppError> {
  return Effect.map(
    runCommand(args, inheritIo(defaultCommandOptions)),
    () => {},
  );
}

function allFlakePackageTargets(): ReadonlyArray<string> {
  return Object.keys(packageConfigs).sort().map((name) => `.#${name}`);
}

function parseNonEmptyLines(text: string): ReadonlyArray<string> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function uniqueSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Array.from(new Set(values)).sort();
}

function packageNameFromPath(path: string): Option.Option<string> {
  const match = path.match(/^pkgs\/[^/]+\/([^/]+)\//);
  const candidate = match?.[1];
  if (typeof candidate === "string" && candidate.length > 0) {
    return Option.some(candidate);
  }
  return Option.none();
}

function isKnownPackage(name: string): boolean {
  return Object.hasOwn(packageConfigs, name);
}

function anyGlobalPkgsChange(paths: ReadonlyArray<string>): boolean {
  return paths.some((path) =>
    path.startsWith("pkgs/") && Option.isNone(packageNameFromPath(path))
  );
}

function resolveChangedPaths(): Effect.Effect<ReadonlyArray<string>, AppError> {
  return Effect.map(
    Effect.flatMap(
      runCommand(
        ["git", "rev-list", "--parents", "-n", "1", "HEAD"],
        defaultCommandOptions,
      ),
      (line) => {
        const parts = line.trim().split(/\s+/g).filter((part) =>
          part.length > 0
        );
        const parents = parts.slice(1);

        if (parents.length >= 2) {
          const base = parents[0];
          const head = parents[1];
          if (typeof base !== "string" || typeof head !== "string") {
            return Effect.succeed("");
          }
          return runCommand(
            ["git", "diff", "--name-only", base, head],
            defaultCommandOptions,
          );
        }

        if (parents.length === 1) {
          const base = parents[0];
          if (typeof base !== "string") {
            return Effect.succeed("");
          }
          return runCommand(
            ["git", "diff", "--name-only", base, "HEAD"],
            defaultCommandOptions,
          );
        }

        return Effect.succeed("");
      },
    ),
    parseNonEmptyLines,
  );
}

function flakePackageTargets(): Effect.Effect<ReadonlyArray<string>, AppError> {
  return Effect.map(resolveChangedPaths(), (paths) => {
    if (anyGlobalPkgsChange(paths)) {
      return allFlakePackageTargets();
    }

    const touched = uniqueSorted(
      paths
        .map(packageNameFromPath)
        .flatMap((name) =>
          Option.isSome(name) && isKnownPackage(name.value) ? [name.value] : []
        ),
    );
    if (touched.length > 0) {
      return touched.map((name) => `.#${name}`);
    }

    return [".#default"];
  });
}

export const ciCheck: Effect.Effect<void, AppError> = Effect.flatMap(
  run(["nix", "run", ".#formatter", "--", "--fail-on-change"]),
  () =>
    Effect.flatMap(
      run(["deno", "check", "lib/ci/workflows.ts", "lib/updater/main.ts"]),
      () =>
        Effect.flatMap(
          run(["deno", "lint"]),
          () =>
            Effect.flatMap(
              run(["nix", "flake", "check"]),
              () =>
                Effect.flatMap(flakePackageTargets(), (targets) =>
                  run([
                    "nix",
                    "build",
                    "--no-link",
                    ...targets,
                  ])),
            ),
        ),
    ),
);
