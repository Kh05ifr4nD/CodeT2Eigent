import * as Effect from "effect/Effect";
import { runMain } from "../common/run.ts";
import {
  type AppError as UpdaterError,
  appError as error,
} from "../common/error.ts";
import { resolvePackageName } from "./config.ts";
import { discoverPackageConfigs } from "./registry.ts";
import {
  updateGithubReleaseAssets,
  updateGithubReleaseTarball,
  updateNpmTarball,
} from "./packages.ts";

export function updatePackageByName(
  name: string,
): Effect.Effect<void, UpdaterError> {
  return Effect.flatMap(discoverPackageConfigs(), (packageConfigs) => {
    const entry = packageConfigs[name];
    if (!entry) {
      return Effect.fail(error.unrecognizedPackage(name));
    }
    if (entry.kind === "github-tarball") {
      return updateGithubReleaseTarball(name, entry.config);
    }
    if (entry.kind === "github-assets") {
      return updateGithubReleaseAssets(name, entry.config);
    }
    return updateNpmTarball(name, entry.config);
  });
}

export function main(): Promise<void> {
  return runMain(
    Effect.flatMap(
      resolvePackageName(Deno.args),
      (name: string) => updatePackageByName(name),
    ),
  );
}

if (import.meta.main) {
  void main();
}
