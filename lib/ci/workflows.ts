import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../common/error.ts";
import {
  envKeys,
  outputKeys,
  parseSpaceSeparated,
  readEnv,
  requireEnv,
  writeOutput,
  writeSummary,
} from "./env.ts";
import { createPr } from "./github.ts";
import { buildMatrix, updateInput, updatePackage } from "./nix.ts";

function optionToString(value: Option.Option<string>): string {
  return Option.match(value, { onNone: () => "", onSome: (text) => text });
}

function optionToDefault(
  value: Option.Option<string>,
  fallback: string,
): string {
  return Option.match(value, {
    onNone: () => fallback,
    onSome: (text) => text,
  });
}

export const discover: Effect.Effect<void, AppError> = Effect.flatMap(
  Effect.sync(() => {
    const packagesText = optionToString(readEnv(envKeys.packages));
    const inputsText = optionToString(readEnv(envKeys.inputs));
    return {
      packages: parseSpaceSeparated(packagesText),
      inputs: parseSpaceSeparated(inputsText),
    };
  }),
  ({ packages, inputs }) =>
    Effect.flatMap(buildMatrix(packages, inputs), (entries) =>
      Effect.flatMap(
        Effect.all([
          writeOutput(outputKeys.matrix, JSON.stringify({ include: entries })),
          writeOutput(
            outputKeys.hasUpdates,
            entries.length > 0 ? "true" : "false",
          ),
        ]),
        () => Effect.void,
      )),
);

export const update: Effect.Effect<void, AppError> = Effect.flatMap(
  Effect.all([
    requireEnv(envKeys.type),
    requireEnv(envKeys.name),
    requireEnv(envKeys.currentVersion),
  ]),
  ([type, name, currentVersion]) =>
    Effect.flatMap(
      type === "package"
        ? updatePackage(name, currentVersion)
        : updateInput(name, currentVersion),
      (result) =>
        Effect.flatMap(
          Effect.all([
            writeOutput(outputKeys.updated, result.updated ? "true" : "false"),
            writeOutput(outputKeys.newVersion, result.next),
          ]),
          () => Effect.void,
        ),
    ),
);

export const createPullRequest: Effect.Effect<void, AppError> = createPr;

export const summary: Effect.Effect<void, AppError> = Effect.flatMap(
  Effect.sync(() => {
    const updateResult = optionToDefault(
      readEnv(envKeys.updateResult),
      "unavailable",
    );
    const autoMerge = optionToDefault(readEnv(envKeys.autoMerge), "false");
    const hasUpdates = optionToDefault(readEnv(envKeys.hasUpdates), "false");

    const lines: string[] = ["## Update Summary", ""];

    if (hasUpdates !== "true") {
      lines.push("No updates were scheduled.");
      return lines;
    }

    if (updateResult === "failure") {
      lines.push("Some update jobs failed. Check workflow logs.");
    } else {
      lines.push("Update jobs completed.");
    }

    lines.push("");
    lines.push("Configuration:");
    lines.push(`- Auto-merge: ${autoMerge}`);

    return lines;
  }),
  (lines) => writeSummary(lines),
);
