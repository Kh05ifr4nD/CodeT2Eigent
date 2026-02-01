import * as Effect from "effect/Effect";
import { type AppError, appError } from "./error.ts";
import { asErrorMessage, type ErrorLike } from "./format.ts";
import { parseJsonText } from "./json.ts";
import type { JsonValue } from "./jsonTypes.ts";

export function fetchText(
  url: string,
  init: RequestInit,
): Effect.Effect<string, AppError> {
  return Effect.async((resume) => {
    fetch(url, init).then(
      (response) => {
        if (!response.ok) {
          resume(
            Effect.fail(
              appError.httpNonOk(url, response.status),
            ),
          );
          return;
        }
        response.text().then(
          (text) => resume(Effect.succeed(text)),
          (reason: ErrorLike) =>
            resume(
              Effect.fail(
                appError.networkReadFailed(url, asErrorMessage(reason)),
              ),
            ),
        );
      },
      (reason: ErrorLike) => {
        resume(
          Effect.fail(
            appError.networkRequestFailed(url, asErrorMessage(reason)),
          ),
        );
      },
    );
  });
}

export function fetchJson(
  url: string,
  init: RequestInit,
): Effect.Effect<JsonValue, AppError> {
  return Effect.flatMap(fetchText(url, init), (text) => parseJsonText(text));
}
