export type GitDependency = Readonly<{
  name: string;
  version: string;
  url: string;
  rev: string;
  drvName: string;
}>;

function parseTomlStringValue(line: string, key: string): string | null {
  const trimmed = line.trim();
  const prefix = `${key} = "`;
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith('"')) {
    return null;
  }
  return trimmed.slice(prefix.length, -1);
}

function repoNameFromUrl(url: string): string {
  const trimmed = url.endsWith("/") ? url.slice(0, -1) : url;
  const lastSlash = trimmed.lastIndexOf("/");
  const tail = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  return tail.endsWith(".git") ? tail.slice(0, -".git".length) : tail;
}

function parseGitSource(
  source: string,
): Readonly<{ url: string; rev: string }> | null {
  const prefix = "git+";
  if (!source.startsWith(prefix)) {
    return null;
  }

  const withoutPrefix = source.slice(prefix.length);
  const hashIndex = withoutPrefix.lastIndexOf("#");
  if (hashIndex < 0) {
    return null;
  }

  const urlWithQuery = withoutPrefix.slice(0, hashIndex);
  const rev = withoutPrefix.slice(hashIndex + 1);
  if (rev.length === 0) {
    return null;
  }

  const queryIndex = urlWithQuery.indexOf("?");
  const url = queryIndex >= 0
    ? urlWithQuery.slice(0, queryIndex)
    : urlWithQuery;
  if (url.length === 0) {
    return null;
  }

  return { url, rev };
}

export function parseGitDependenciesFromCargoLock(
  text: string,
): ReadonlyArray<GitDependency> {
  const dependencies: GitDependency[] = [];

  let name: string | null = null;
  let version: string | null = null;
  let source: string | null = null;

  const flush = (): void => {
    if (!name || !version || !source) {
      name = null;
      version = null;
      source = null;
      return;
    }

    const git = parseGitSource(source);
    if (!git) {
      name = null;
      version = null;
      source = null;
      return;
    }

    const repoName = repoNameFromUrl(git.url);
    const shortRev = git.rev.length >= 7 ? git.rev.slice(0, 7) : git.rev;
    dependencies.push({
      name,
      version,
      url: git.url,
      rev: git.rev,
      drvName: `${repoName}-${shortRev}`,
    });

    name = null;
    version = null;
    source = null;
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[[package]]") {
      flush();
      continue;
    }

    const parsedName = parseTomlStringValue(trimmed, "name");
    if (parsedName) {
      name = parsedName;
      continue;
    }

    const parsedVersion = parseTomlStringValue(trimmed, "version");
    if (parsedVersion) {
      version = parsedVersion;
      continue;
    }

    const parsedSource = parseTomlStringValue(trimmed, "source");
    if (parsedSource) {
      source = parsedSource;
      continue;
    }
  }

  flush();
  return dependencies;
}

export function cargoLockOutputHashKey(dep: GitDependency): string {
  return `${dep.name}-${dep.version}`;
}

export function groupOutputHashKeysByDrvName(
  deps: ReadonlyArray<GitDependency>,
): Readonly<Record<string, ReadonlyArray<string>>> {
  const map = new Map<string, string[]>();
  for (const dep of deps) {
    const key = cargoLockOutputHashKey(dep);
    const list = map.get(dep.drvName);
    if (list) {
      list.push(key);
    } else {
      map.set(dep.drvName, [key]);
    }
  }

  const entries: Array<[string, ReadonlyArray<string>]> = [];
  for (const [drvName, keys] of map.entries()) {
    entries.push([drvName, keys.slice().sort()]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}
