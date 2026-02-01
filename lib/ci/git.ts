import * as Effect from "effect/Effect";
import { defaultCommandOptions, runCommand } from "../common/command.ts";
import type { AppError } from "../common/error.ts";

export function gitHasChanges(): Effect.Effect<boolean, AppError> {
  return Effect.map(
    runCommand(["git", "status", "--porcelain"], defaultCommandOptions),
    (status) => status.trim().length > 0,
  );
}

export function ensureGitConfig(): Effect.Effect<void, AppError> {
  return Effect.flatMap(
    runCommand(
      ["git", "config", "user.name", "github-actions[bot]"],
      defaultCommandOptions,
    ),
    () =>
      Effect.map(
        runCommand(
          [
            "git",
            "config",
            "user.email",
            "41898282+github-actions[bot]@users.noreply.github.com",
          ],
          defaultCommandOptions,
        ),
        () => {},
      ),
  );
}
