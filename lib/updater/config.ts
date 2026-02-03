import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  type AppError as UpdaterError,
  appError as error,
} from "../common/error.ts";

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
