import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, appError } from "../common/error.ts";
import { buildGithubHeaders } from "../common/github.ts";
import { fetchJson } from "../common/http.ts";
import {
  asArray,
  asObject,
  getField,
  getStringField,
  type JsonArray,
  type JsonObject,
  type JsonValue,
  requireArrayValue,
  requireNonEmptyStringField,
  requireNumberField,
  requireObjectValue,
} from "../common/jsonValue.ts";
import { defaultCommandOptions, runCommand } from "../common/command.ts";
import {
  envKeys,
  outputKeys,
  readEnv,
  requireEnv,
  writeOutput,
} from "./env.ts";
import { ensureGitConfig, gitHasChanges } from "./git.ts";
import { getRepoInfo } from "./repo.ts";

type PullRequest = Readonly<{
  number: number;
  url: string;
  nodeId: string;
}>;

function githubHeaders(token: string): HeadersInit {
  return buildGithubHeaders({
    token: Option.some(token),
    userAgent: "codet2eigent-ci",
  });
}

function githubRequest(
  method: string,
  path: string,
  token: string,
  body: Option.Option<JsonValue>,
): Effect.Effect<JsonValue, AppError> {
  const url = `https://api.github.com${path}`;
  const bodyPart = Option.match(body, {
    onNone: () => ({}),
    onSome: (value) => ({ body: JSON.stringify(value) }),
  });

  return fetchJson(url, {
    method,
    headers: githubHeaders(token),
    ...bodyPart,
  });
}

function graphqlRequest(
  token: string,
  query: string,
  variables: JsonObject,
): Effect.Effect<JsonValue, AppError> {
  return fetchJson("https://api.github.com/graphql", {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({ query, variables }),
  });
}

function decodePullRequest(
  value: JsonValue,
): Effect.Effect<PullRequest, AppError> {
  const context = "github.pullRequest";
  return Effect.flatMap(
    requireObjectValue(value, context),
    (object) =>
      Effect.flatMap(
        Effect.all([
          requireNumberField(object, "number", context),
          requireNonEmptyStringField(object, "html_url", context),
          requireNonEmptyStringField(object, "node_id", context),
        ]),
        ([number, url, nodeId]) => Effect.succeed({ number, url, nodeId }),
      ),
  );
}

function decodeDefaultBranch(
  value: JsonValue,
): Effect.Effect<string, AppError> {
  const context = "github.repository";
  return Effect.flatMap(
    requireObjectValue(value, context),
    (object) => requireNonEmptyStringField(object, "default_branch", context),
  );
}

function firstArrayValue(array: JsonArray): Option.Option<JsonValue> {
  return array.length > 0 ? Option.some(array[0] as JsonValue) : Option.none();
}

function listExistingPullRequest(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Effect.Effect<Option.Option<PullRequest>, AppError> {
  const path =
    `/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${branch}`;
  return Effect.flatMap(
    githubRequest("GET", path, token, Option.none()),
    (json) => {
      return Effect.flatMap(
        requireArrayValue(json, "github.pullRequestList"),
        (array) => {
          const first = firstArrayValue(array);
          if (Option.isNone(first)) {
            return Effect.succeed(Option.none());
          }
          return Effect.map(
            decodePullRequest(first.value),
            (pr) => Option.some(pr),
          );
        },
      );
    },
  );
}

function updatePullRequest(
  token: string,
  owner: string,
  repo: string,
  number: number,
  title: string,
  body: string,
): Effect.Effect<PullRequest, AppError> {
  const path = `/repos/${owner}/${repo}/pulls/${number}`;
  return Effect.flatMap(
    githubRequest("PATCH", path, token, Option.some({ title, body })),
    decodePullRequest,
  );
}

function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  title: string,
  body: string,
): Effect.Effect<PullRequest, AppError> {
  const repoPath = `/repos/${owner}/${repo}`;
  const defaultBranch = Effect.flatMap(
    githubRequest("GET", repoPath, token, Option.none()),
    decodeDefaultBranch,
  );

  return Effect.flatMap(defaultBranch, (base) =>
    Effect.flatMap(
      githubRequest(
        "POST",
        `/repos/${owner}/${repo}/pulls`,
        token,
        Option.some({ title, body, head: branch, base }),
      ),
      decodePullRequest,
    ));
}

function createOrUpdatePullRequest(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  title: string,
  body: string,
): Effect.Effect<PullRequest, AppError> {
  return Effect.flatMap(
    listExistingPullRequest(token, owner, repo, branch),
    (existing) =>
      Option.match(existing, {
        onNone: () =>
          createPullRequest(token, owner, repo, branch, title, body),
        onSome: (pr) =>
          updatePullRequest(token, owner, repo, pr.number, title, body),
      }),
  );
}

function addLabels(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  labels: ReadonlyArray<string>,
): Effect.Effect<void, AppError> {
  if (labels.length === 0) {
    return Effect.void;
  }
  const path = `/repos/${owner}/${repo}/issues/${prNumber}/labels`;
  return Effect.map(
    githubRequest("POST", path, token, Option.some({ labels })),
    () => {},
  );
}

function enableAutoMerge(
  token: string,
  pullRequestId: string,
): Effect.Effect<void, AppError> {
  const mutation = `
    mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
      enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
        clientMutationId
      }
    }
  `;

  return Effect.flatMap(
    graphqlRequest(token, mutation, {
      pullRequestId,
      mergeMethod: "SQUASH",
    }),
    (json) =>
      Effect.flatMap(
        requireObjectValue(json, "github.graphqlResponse"),
        (object) => {
          const errors = Option.flatMap(getField(object, "errors"), asArray);
          if (Option.isSome(errors) && errors.value.length > 0) {
            const messages = errors.value
              .map((entry) =>
                Option.flatMap(asObject(entry), (entryObj) =>
                  getStringField(entryObj, "message"))
              )
              .flatMap((message) =>
                Option.isSome(message) ? [message.value] : []
              );
            if (
              messages.some((message) =>
                message.includes("clean status")
              )
            ) {
              return mergePullRequest(token, pullRequestId);
            }
            return Effect.fail(appError.githubGraphqlErrors(json));
          }
          return Effect.void;
        },
      ),
  );
}

function mergePullRequest(
  token: string,
  pullRequestId: string,
): Effect.Effect<void, AppError> {
  const mutation = `
    mutation MergePullRequest($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
      mergePullRequest(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
        clientMutationId
      }
    }
  `;

  return Effect.flatMap(
    graphqlRequest(token, mutation, {
      pullRequestId,
      mergeMethod: "SQUASH",
    }),
    (json) =>
      Effect.flatMap(requireObjectValue(json, "github.graphqlResponse"), (
        object,
      ) => {
        const errors = Option.flatMap(getField(object, "errors"), asArray);
        if (Option.isSome(errors) && errors.value.length > 0) {
          return Effect.fail(appError.githubGraphqlErrors(json));
        }
        return Effect.void;
      }),
  );
}

function runGit(args: ReadonlyArray<string>): Effect.Effect<void, AppError> {
  return Effect.map(runCommand(args, defaultCommandOptions), () => {});
}

function sanitizeGitRefSegment(value: string): string {
  return value
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-+/g, "-");
}

function branchName(type: string, name: string): string {
  const typePart = sanitizeGitRefSegment(type);
  const namePart = sanitizeGitRefSegment(name);
  return `update/${typePart}/${namePart}`;
}

function pullRequestTitle(
  type: string,
  name: string,
  currentVersion: string,
  newVersion: string,
): string {
  return type === "flake-input"
    ? `flake.lock: Update ${name}`
    : `${name}: ${currentVersion} -> ${newVersion}`;
}

function pullRequestBody(
  type: string,
  name: string,
  currentVersion: string,
  newVersion: string,
): string {
  if (type === "flake-input") {
    return [
      `This PR updates the flake input \`${name}\` to the latest version.`,
      "",
      "## Changes",
      `- ${name}: \`${currentVersion}\` → \`${newVersion}\``,
    ].join("\n");
  }
  return `Automated update of ${name} from ${currentVersion} to ${newVersion}.`;
}

export const createPr: Effect.Effect<void, AppError> = Effect.flatMap(
  Effect.all([
    requireEnv(envKeys.type),
    requireEnv(envKeys.name),
    requireEnv(envKeys.currentVersion),
    requireEnv(envKeys.newVersion),
    requireEnv(envKeys.ghToken),
  ]),
  ([type, name, currentVersion, newVersion, token]) => {
    const autoMerge = Option.match(readEnv(envKeys.autoMerge), {
      onNone: () => false,
      onSome: (value) => value === "true",
    });

    const labels = Option.match(readEnv(envKeys.prLabels), {
      onNone: () => [],
      onSome: (value) =>
        value
          .split(",")
          .map((label) => label.trim())
          .filter((label) => label.length > 0),
    });

    return Effect.flatMap(gitHasChanges(), (changed) => {
      if (!changed) {
        return writeOutput(outputKeys.created, "false");
      }

      const branch = branchName(type, name);
      const title = pullRequestTitle(type, name, currentVersion, newVersion);
      const body = pullRequestBody(type, name, currentVersion, newVersion);

      const gitFlow = Effect.flatMap(
        ensureGitConfig(),
        () =>
          Effect.flatMap(
            runGit(["git", "checkout", "-b", branch]),
            () =>
              Effect.flatMap(runGit(["git", "add", "-A"]), () => {
                const commitMessage = type === "flake-input"
                  ? `${title}\n\n${currentVersion} -> ${newVersion}`
                  : title;
                return Effect.flatMap(
                  runGit(["git", "commit", "-m", commitMessage, "--signoff"]),
                  () =>
                    runGit([
                      "git",
                      "push",
                      "--force-with-lease",
                      "-u",
                      "origin",
                      branch,
                    ]),
                );
              }),
          ),
      );

      const prFlow = Effect.flatMap(
        getRepoInfo(),
        ({ owner, repo }) =>
          Effect.flatMap(
            createOrUpdatePullRequest(token, owner, repo, branch, title, body),
            (pr) =>
              Effect.flatMap(
                addLabels(token, owner, repo, pr.number, labels),
                () =>
                  autoMerge
                    ? Effect.flatMap(
                      enableAutoMerge(token, pr.nodeId),
                      () => Effect.succeed(pr),
                    )
                    : Effect.succeed(pr),
              ),
          ),
      );

      return Effect.flatMap(
        gitFlow,
        () =>
          Effect.flatMap(prFlow, (pr) =>
            Effect.flatMap(
              Effect.all([
                writeOutput(outputKeys.created, "true"),
                writeOutput(outputKeys.prUrl, pr.url),
                writeOutput(outputKeys.prNumber, String(pr.number)),
              ]),
              () => Effect.void,
            )),
      );
    });
  },
);
