import * as Effect from "effect/Effect";
import { type AppError, appError } from "../common/error.ts";
import { requireEnv } from "./env.ts";

export type RepoInfo = Readonly<{
  owner: string;
  repo: string;
}>;

export function getRepoInfo(): Effect.Effect<RepoInfo, AppError> {
  return Effect.flatMap(requireEnv("GITHUB_REPOSITORY"), (repoSlug) => {
    const index = repoSlug.indexOf("/");
    if (index <= 0 || index >= repoSlug.length - 1) {
      return Effect.fail(appError.invalidEnv("GITHUB_REPOSITORY", repoSlug));
    }
    const owner = repoSlug.slice(0, index);
    const repo = repoSlug.slice(index + 1);
    return Effect.succeed({ owner, repo });
  });
}
