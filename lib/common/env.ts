import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, appError } from "./error.ts";

export function readEnv(name: string): Option.Option<string> {
  const value = Deno.env.get(name);
  return typeof value === "string" && value.length > 0
    ? Option.some(value)
    : Option.none();
}

export function requireEnv(name: string): Effect.Effect<string, AppError> {
  return Effect.flatMap(
    Effect.sync(() => readEnv(name)),
    (value) =>
      Option.match(value, {
        onNone: () => Effect.fail(appError.missingEnv(name)),
        onSome: (present) => Effect.succeed(present),
      }),
  );
}

export function parseSpaceSeparated(text: string): ReadonlyArray<string> {
  return text
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
