import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../common/error.ts";
import { parseSpaceSeparated, readEnv, requireEnv } from "../common/env.ts";
import { appendTextFile } from "../common/fs.ts";

export const envKeys = {
  packages: "packages",
  inputs: "inputs",
  type: "type",
  name: "name",
  currentVersion: "currentVersion",
  newVersion: "newVersion",
  ghToken: "ghToken",
  prLabels: "prLabels",
  autoMerge: "autoMerge",
  updateResult: "updateResult",
  hasUpdates: "hasUpdates",
} as const;

export const outputKeys = {
  matrix: "matrix",
  hasUpdates: "hasUpdates",
  updated: "updated",
  newVersion: "newVersion",
  created: "created",
  prUrl: "prUrl",
  prNumber: "prNumber",
} as const;

export { parseSpaceSeparated, readEnv, requireEnv };

function normalizeDelimiterPart(text: string): string {
  const normalized = text.replaceAll(/[^a-zA-Z0-9]+/g, "_").replaceAll(
    /^_+|_+$/g,
    "",
  );
  return normalized.length > 0 ? normalized : "VALUE";
}

function selectDelimiter(base: string, value: string): string {
  if (!value.includes(base)) {
    return base;
  }
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!value.includes(candidate)) {
      return candidate;
    }
  }
  return `${base}_${Date.now()}`;
}

function formatGithubOutput(name: string, value: string): string {
  const base = `__CODET2EIGENT_${normalizeDelimiterPart(name).toUpperCase()}__`;
  const delimiter = selectDelimiter(base, value);
  return `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
}

export function writeOutput(
  name: string,
  value: string,
): Effect.Effect<void, AppError> {
  const outputPath = readEnv("GITHUB_OUTPUT");
  const line = formatGithubOutput(name, value);
  return Option.match(outputPath, {
    onNone: () =>
      Effect.sync(() => {
        console.log(`${name}=${value}`);
      }),
    onSome: (path) => appendTextFile(path, line),
  });
}

export function writeSummary(
  lines: ReadonlyArray<string>,
): Effect.Effect<void, AppError> {
  const summaryPath = readEnv("GITHUB_STEP_SUMMARY");
  return Option.match(summaryPath, {
    onNone: () => Effect.void,
    onSome: (path) => appendTextFile(path, `${lines.join("\n")}\n`),
  });
}
