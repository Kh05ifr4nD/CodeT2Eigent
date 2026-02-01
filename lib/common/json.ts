import * as Effect from "effect/Effect";
import { type AppError, appError } from "./error.ts";
import { asErrorMessage, type ErrorLike } from "./format.ts";
import { readTextFile, writeTextFile } from "./fs.ts";
import type { JsonValue } from "./jsonTypes.ts";

export function formatJson(value: JsonValue): string {
  return `${JSON.stringify(value, (_key, next) => next, 2)}\n`;
}

export function parseJsonText(
  text: string,
): Effect.Effect<JsonValue, AppError> {
  const response = new Response(text, {
    headers: { "content-type": "application/json" },
  });

  return Effect.async((resume) => {
    response.json().then(
      (value: JsonValue) => {
        resume(Effect.succeed(value));
      },
      (reason: ErrorLike) => {
        resume(
          Effect.fail(
            appError.invalidJson(asErrorMessage(reason)),
          ),
        );
      },
    );
  });
}

export function readJsonFile(
  path: string | URL,
): Effect.Effect<JsonValue, AppError> {
  return Effect.flatMap(readTextFile(path), (text) => parseJsonText(text));
}

export function writeJsonFile(
  path: string | URL,
  value: JsonValue,
): Effect.Effect<void, AppError> {
  return writeTextFile(path, formatJson(value));
}
