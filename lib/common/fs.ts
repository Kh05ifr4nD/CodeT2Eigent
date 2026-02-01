import * as Effect from "effect/Effect";
import { type AppError, appError } from "./error.ts";
import { asErrorMessage, type ErrorLike } from "./format.ts";

function pathLabel(path: string | URL): string {
  return typeof path === "string" ? path : path.pathname;
}

export function fileExists(
  path: string | URL,
): Effect.Effect<boolean, AppError> {
  return Effect.async((resume) => {
    Deno.stat(path).then(
      (info) => {
        resume(Effect.succeed(info.isFile));
      },
      () => {
        resume(Effect.succeed(false));
      },
    );
  });
}

export function readTextFile(
  path: string | URL,
): Effect.Effect<string, AppError> {
  return Effect.async((resume) => {
    Deno.readTextFile(path).then(
      (text: string) => {
        resume(Effect.succeed(text));
      },
      (reason: ErrorLike) => {
        resume(
          Effect.fail(
            appError.ioReadFailed(pathLabel(path), asErrorMessage(reason)),
          ),
        );
      },
    );
  });
}

export function writeTextFile(
  path: string | URL,
  text: string,
): Effect.Effect<void, AppError> {
  return Effect.async((resume) => {
    Deno.writeTextFile(path, text).then(
      () => {
        resume(Effect.void);
      },
      (reason: ErrorLike) => {
        resume(
          Effect.fail(
            appError.ioWriteFailed(pathLabel(path), asErrorMessage(reason)),
          ),
        );
      },
    );
  });
}

export function appendTextFile(
  path: string | URL,
  text: string,
): Effect.Effect<void, AppError> {
  return Effect.async((resume) => {
    Deno.writeTextFile(path, text, { append: true }).then(
      () => {
        resume(Effect.void);
      },
      (reason: ErrorLike) => {
        resume(
          Effect.fail(
            appError.ioAppendFailed(pathLabel(path), asErrorMessage(reason)),
          ),
        );
      },
    );
  });
}
