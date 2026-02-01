import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  type AppError as UpdaterError,
  appError as error,
} from "../common/error.ts";
import type { AssetsConfig, PackageConfig, TarballConfig } from "./packages.ts";

function packageNameFromArgs(
  args: ReadonlyArray<string>,
): Option.Option<string> {
  const index = args.indexOf("--pkg");
  if (index < 0) {
    return Option.none();
  }
  const value = args[index + 1];
  if (typeof value === "string" && value.length > 0) {
    return Option.some(value);
  }
  return Option.none();
}

function basename(pathValue: string): string {
  const parts = pathValue.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return typeof last === "string" && last.length > 0 ? last : "";
}

export function resolvePackageName(
  args: ReadonlyArray<string>,
): Effect.Effect<string, UpdaterError> {
  const fromArgs = packageNameFromArgs(args);
  if (Option.isSome(fromArgs)) {
    return Effect.succeed(fromArgs.value);
  }
  const inferred = basename(Deno.cwd());
  if (inferred.length > 0) {
    return Effect.succeed(inferred);
  }
  return Effect.fail(error.missingPackageName(args));
}

export const packageConfigs: Readonly<Record<string, PackageConfig>> = {
  codex: {
    kind: "github-tarball",
    config: {
      owner: "openai",
      repo: "codex",
      tagPrefix: "rust-v",
      hashPath: new URL("../../pkgs/codex/codex/hash.json", import.meta.url),
      includeCargoHashPlaceholder: true,
    } satisfies TarballConfig,
  },
  opencode: {
    kind: "github-assets",
    config: {
      owner: "anomalyco",
      repo: "opencode",
      tagPrefix: "v",
      hashPath: new URL(
        "../../pkgs/opencode/opencode/hash.json",
        import.meta.url,
      ),
      assets: [
        ["x86_64-linux", "opencode-linux-x64.tar.gz"],
        ["aarch64-linux", "opencode-linux-arm64.tar.gz"],
        ["x86_64-darwin", "opencode-darwin-x64.zip"],
        ["aarch64-darwin", "opencode-darwin-arm64.zip"],
      ],
    } satisfies AssetsConfig,
  },
  "oh-my-opencode": {
    kind: "npm-tarball",
    config: {
      packageName: "oh-my-opencode",
      hashPath: new URL(
        "../../pkgs/opencode/oh-my-opencode/hash.json",
        import.meta.url,
      ),
    },
  },
  skills: {
    kind: "npm-tarball",
    config: {
      packageName: "skills",
      hashPath: new URL("../../pkgs/skill/skills/hash.json", import.meta.url),
    },
  },
};
