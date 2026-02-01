import * as Effect from "effect/Effect";
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

function flakePackageTargets(): ReadonlyArray<string> {
  return Object.keys(packageConfigs).sort().map((name) => `.#${name}`);
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
                run([
                  "nix",
                  "build",
                  "--no-link",
                  ...flakePackageTargets(),
                ]),
            ),
        ),
    ),
);
