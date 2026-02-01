import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, appError } from "../common/error.ts";
import {
  type CommandOptions,
  defaultCommandOptions,
  runCommand,
} from "../common/command.ts";
import { parseJsonText } from "../common/json.ts";
import { requireArrayValue } from "../common/jsonValue.ts";
import type { JsonValue } from "../common/jsonTypes.ts";

function inheritIo(options: CommandOptions): CommandOptions {
  return { ...options, stdout: "inherit", stderr: "inherit" };
}

function run(args: ReadonlyArray<string>): Effect.Effect<void, AppError> {
  return Effect.map(
    runCommand(args, inheritIo(defaultCommandOptions)),
    () => {},
  );
}

function parseNonEmptyLines(text: string): ReadonlyArray<string> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function requireNonEmptyString(
  value: string | undefined,
  context: string,
): Effect.Effect<string, AppError> {
  if (typeof value === "string" && value.length > 0) {
    return Effect.succeed(value);
  }
  return Effect.fail(
    appError.invalidJson(`${context}: expected non-empty string`),
  );
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

function anyGlobalPkgsChange(paths: ReadonlyArray<string>): boolean {
  return paths.some((path) =>
    path.startsWith("pkgs/") && Option.isNone(packageNameFromPath(path))
  );
}

function stringArrayFromJsonValue(
  value: JsonValue,
  context: string,
): Effect.Effect<ReadonlyArray<string>, AppError> {
  return Effect.flatMap(requireArrayValue(value, context), (array) => {
    const strings: string[] = [];
    for (const [index, item] of array.entries()) {
      if (typeof item !== "string") {
        return Effect.fail(
          appError.invalidJson(
            `${context}: expected string at index ${index}`,
          ),
        );
      }
      strings.push(item);
    }
    return Effect.succeed(strings);
  });
}

function resolveFlakePackageNames(): Effect.Effect<
  ReadonlyArray<string>,
  AppError
> {
  return Effect.flatMap(
    runCommand(
      [
        "nix",
        "eval",
        "--json",
        "--impure",
        "--expr",
        "let system = builtins.currentSystem; flake = builtins.getFlake (toString ./.); in builtins.attrNames flake.packages.${system}",
      ],
      defaultCommandOptions,
    ),
    (stdout) =>
      Effect.flatMap(
        parseJsonText(stdout),
        (json) => stringArrayFromJsonValue(json, "nix eval flake packages"),
      ),
  );
}

function resolveChangedPaths(): Effect.Effect<ReadonlyArray<string>, AppError> {
  return Effect.flatMap(
    runCommand(
      ["git", "rev-list", "--parents", "-n", "1", "HEAD"],
      defaultCommandOptions,
    ),
    (line) => {
      const parts = line.trim().split(/\s+/g).filter((part) => part.length > 0);
      if (parts.length === 0) {
        return Effect.fail(
          appError.invalidJson(
            "git rev-list --parents -n 1 HEAD: expected non-empty output",
          ),
        );
      }

      const parents = parts.slice(1);

      if (parents.length >= 2) {
        return Effect.flatMap(
          Effect.all([
            requireNonEmptyString(parents[0], "git rev-list first parent"),
            requireNonEmptyString(parents[1], "git rev-list second parent"),
          ]),
          ([base, head]) =>
            Effect.map(
              runCommand(
                ["git", "diff", "--name-only", base, head],
                defaultCommandOptions,
              ),
              parseNonEmptyLines,
            ),
        );
      }

      if (parents.length === 1) {
        return Effect.flatMap(
          requireNonEmptyString(parents[0], "git rev-list parent"),
          (base) =>
            Effect.map(
              runCommand(
                ["git", "diff", "--name-only", base, "HEAD"],
                defaultCommandOptions,
              ),
              parseNonEmptyLines,
            ),
        );
      }

      return Effect.succeed([]);
    },
  );
}

function flakePackageTargets(): Effect.Effect<ReadonlyArray<string>, AppError> {
  return Effect.flatMap(
    Effect.all([resolveChangedPaths(), resolveFlakePackageNames()]),
    ([paths, flakePackageNames]) => {
      const available = new Set(flakePackageNames);

      if (anyGlobalPkgsChange(paths)) {
        return Effect.succeed(flakePackageNames.map((name) => `.#${name}`));
      }

      const touched = uniqueSorted(
        paths
          .map(packageNameFromPath)
          .flatMap((name) => (Option.isSome(name) ? [name.value] : [])),
      );

      const unrecognized = touched.filter((name) => !available.has(name));
      if (unrecognized.length > 0) {
        return Effect.fail(appError.unrecognizedPackages(unrecognized));
      }

      if (touched.length > 0) {
        return Effect.succeed(touched.map((name) => `.#${name}`));
      }

      return Effect.succeed([]);
    },
  );
}

export const ciCheck: Effect.Effect<void, AppError> = Effect.flatMap(
  run(["nix", "fmt", "--", "--fail-on-change"]),
  () =>
    Effect.flatMap(
      run([
        "deno",
        "check",
        "lib/ci/checks.ts",
        "lib/ci/workflows.ts",
        "lib/updater/main.ts",
      ]),
      () =>
        Effect.flatMap(
          run(["deno", "lint"]),
          () =>
            Effect.flatMap(
              run(["nix", "flake", "check"]),
              () =>
                Effect.flatMap(flakePackageTargets(), (targets) => {
                  if (targets.length === 0) {
                    return Effect.void;
                  }
                  return run([
                    "nix",
                    "build",
                    "--no-link",
                    ...targets,
                  ]);
                }),
            ),
        ),
    ),
);
