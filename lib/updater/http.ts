import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import { buildGithubHeaders } from "../common/github.ts";
import { fetchJson } from "../common/http.ts";
import {
  requireNonEmptyStringField,
  requireObjectValue,
} from "../common/jsonValue.ts";
import {
  type AppError as UpdaterError,
  appError as error,
} from "../common/error.ts";

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

function encodePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function decodeGitHubBase64(content: string): string {
  // GitHub returns base64 with newlines.
  const normalized = content.replaceAll("\n", "");
  const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function fetchGitHubFileText(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: Option.Option<string>,
): Effect.Effect<string, UpdaterError> {
  const encodedPath = encodePath(path);
  const url =
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${
      encodeURIComponent(ref)
    }`;
  const context = `github.contents ${owner}/${repo} ${path}@${ref}`;

  return Effect.flatMap(
    fetchJson(url, {
      method: "GET",
      headers: buildGithubHeaders({ token, userAgent: "codet2eigent-updater" }),
    }),
    (data) =>
      Effect.flatMap(
        requireObjectValue(data, context),
        (payload) =>
          Effect.flatMap(
            Effect.all([
              requireNonEmptyStringField(payload, "encoding", context),
              requireNonEmptyStringField(payload, "content", context),
            ]),
            ([encoding, content]) => {
              if (encoding !== "base64") {
                return Effect.fail(
                  error.invalidJson(
                    `${context}: unsupported encoding ${
                      JSON.stringify(encoding)
                    }`,
                  ),
                );
              }
              return Effect.succeed(decodeGitHubBase64(content));
            },
          ),
      ),
  );
}
