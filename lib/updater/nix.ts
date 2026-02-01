import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError as UpdaterError, appError } from "../common/error.ts";
import { defaultCommandOptions, runCommandRaw } from "../common/command.ts";
import { parseJsonText } from "../common/json.ts";
import {
  requireNonEmptyStringField,
  requireObjectValue,
} from "../common/jsonValue.ts";

const repoRootPath = decodeURIComponent(
  new URL("../../", import.meta.url).pathname,
);

export const fakeSha256Hash =
  "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function extractGotSha256Hash(text: string): string {
  const match = text.match(/got:\s*(sha256-[0-9A-Za-z+/=]+)(?:\s|$)/);
  return match && typeof match[1] === "string" ? match[1] : "";
}

export function inferCargoHashFromBuild(
  packageName: string,
  placeholder: string = fakeSha256Hash,
): Effect.Effect<string, UpdaterError> {
  const args = ["nix", "build", `.#${packageName}`, "--no-link"];
  const options = { ...defaultCommandOptions, cwd: Option.some(repoRootPath) };

  return Effect.flatMap(runCommandRaw(args, options), (result) => {
    if (result.code === 0) {
      return Effect.succeed(placeholder);
    }

    const hash = extractGotSha256Hash(`${result.stdout}\n${result.stderr}`);
    if (hash.length > 0) {
      return Effect.succeed(hash);
    }

    return Effect.fail(
      appError.commandNonZeroExit(
        args,
        result.code,
        result.stdout,
        result.stderr,
      ),
    );
  });
}

export function prefetchFileHash(
  url: string,
  options: Readonly<{ unpack: boolean }> = { unpack: false },
): Effect.Effect<string, UpdaterError> {
  const args = ["store", "prefetch-file", "--hash-type", "sha256"];
  if (options.unpack) {
    args.push("--unpack");
  }
  args.push("--json", url);

  const commandArgs = ["nix", ...args];
  const command = runCommandRaw(
    commandArgs,
    { ...defaultCommandOptions, stderr: "inherit" },
  );

  return Effect.flatMap(command, (result) => {
    if (result.code !== 0) {
      return Effect.fail(
        appError.commandNonZeroExit(
          commandArgs,
          result.code,
          result.stdout,
          result.stderr,
        ),
      );
    }

    return Effect.flatMap(
      parseJsonText(result.stdout),
      (json) =>
        Effect.flatMap(
          requireObjectValue(json, "nix.store.prefetch-file"),
          (object) =>
            requireNonEmptyStringField(
              object,
              "hash",
              "nix.store.prefetch-file",
            ),
        ),
    );
  });
}
