import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import { buildGithubHeaders } from "../common/github.ts";
import { fetchJson } from "../common/http.ts";
import {
  requireNonEmptyStringField,
  requireObjectValue,
} from "../common/jsonValue.ts";
import type { AppError as UpdaterError } from "../common/error.ts";

export function fetchGitHubLatestRelease(
  owner: string,
  repo: string,
  token: Option.Option<string>,
): Effect.Effect<string, UpdaterError> {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  return Effect.flatMap(
    fetchJson(url, {
      method: "GET",
      headers: buildGithubHeaders({ token, userAgent: "codet2eigent-updater" }),
    }),
    (data) =>
      Effect.flatMap(
        requireObjectValue(data, `github.releasesLatest ${owner}/${repo}`),
        (payload) =>
          requireNonEmptyStringField(
            payload,
            "tag_name",
            `github.releasesLatest ${owner}/${repo}`,
          ),
      ),
  );
}

export function fetchNpmLatestVersion(
  packageName: string,
): Effect.Effect<string, UpdaterError> {
  const url = `https://registry.npmjs.org/${
    encodeURIComponent(packageName)
  }/latest`;
  return Effect.flatMap(
    fetchJson(url, { method: "GET", headers: { Accept: "application/json" } }),
    (data) =>
      Effect.flatMap(
        requireObjectValue(data, `npm.latest ${packageName}`),
        (payload) =>
          requireNonEmptyStringField(
            payload,
            "version",
            `npm.latest ${packageName}`,
          ),
      ),
  );
}
