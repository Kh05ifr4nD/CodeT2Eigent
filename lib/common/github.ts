import * as Option from "effect/Option";

export type GithubHeadersParams = Readonly<{
  token: Option.Option<string>;
  userAgent: string;
}>;

export function buildGithubHeaders(params: GithubHeadersParams): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": params.userAgent,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (Option.isSome(params.token)) {
    headers.Authorization = `Bearer ${params.token.value}`;
  }

  return headers;
}
