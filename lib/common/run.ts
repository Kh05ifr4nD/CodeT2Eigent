import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type { AppError } from "./error.ts";
import type { JsonValue } from "./jsonTypes.ts";

function formatJsonValue(value: JsonValue): string {
  return JSON.stringify(value, (_key, next) => next, 2);
}

export function formatFailureLines(failure: AppError): ReadonlyArray<string> {
  switch (failure.tag) {
    case "missingEnv":
      return [`[missingEnv] Missing environment variable: ${failure.envKey}`];
    case "invalidEnv":
      return [`[invalidEnv] Invalid ${failure.envKey}: ${failure.value}`];
    case "missingCommand":
      return [
        `[missingCommand] Missing command (args: ${failure.args.join(" ")})`,
      ];
    case "commandSpawnFailed":
      return [
        `[commandSpawnFailed] ${failure.args.join(" ")}`,
        failure.cause,
      ].filter((line) => line.trim().length > 0);
    case "commandNonZeroExit": {
      const lines = [
        `[commandNonZeroExit] ${
          failure.args.join(" ")
        } (exit ${failure.exitCode})`,
      ];
      if (failure.stderr.trim().length > 0) {
        lines.push(failure.stderr.trimEnd());
      }
      if (failure.stdout.trim().length > 0) {
        lines.push(failure.stdout.trimEnd());
      }
      return lines;
    }
    case "ioReadFailed":
      return [`[ioReadFailed] ${failure.path}`, failure.cause].filter((line) =>
        line.trim().length > 0
      );
    case "ioWriteFailed":
      return [`[ioWriteFailed] ${failure.path}`, failure.cause].filter((line) =>
        line.trim().length > 0
      );
    case "ioAppendFailed":
      return [`[ioAppendFailed] ${failure.path}`, failure.cause].filter((
        line,
      ) => line.trim().length > 0);
    case "httpNonOk":
      return [`[httpNonOk] ${failure.url} (${failure.status})`];
    case "networkRequestFailed":
      return [`[networkRequestFailed] ${failure.url}`, failure.cause].filter((
        line,
      ) => line.trim().length > 0);
    case "networkReadFailed":
      return [`[networkReadFailed] ${failure.url}`, failure.cause].filter((
        line,
      ) => line.trim().length > 0);
    case "invalidJson":
      return [`[invalidJson]`, failure.cause].filter((line) =>
        line.trim().length > 0
      );
    case "jsonExpectedObject":
      return [
        `[jsonExpectedObject] ${failure.context}`,
        formatJsonValue(failure.got),
      ];
    case "jsonExpectedArray":
      return [
        `[jsonExpectedArray] ${failure.context}`,
        formatJsonValue(failure.got),
      ];
    case "jsonMissingField":
      return [
        `[jsonMissingField] ${failure.context}: ${failure.field}`,
        `keys: ${failure.objectKeys.join(", ")}`,
      ];
    case "jsonFieldNotString":
      return [
        `[jsonFieldNotString] ${failure.context}: ${failure.field}`,
        formatJsonValue(failure.got),
      ];
    case "jsonFieldEmptyString":
      return [`[jsonFieldEmptyString] ${failure.context}: ${failure.field}`];
    case "jsonFieldNotNumber":
      return [
        `[jsonFieldNotNumber] ${failure.context}: ${failure.field}`,
        formatJsonValue(failure.got),
      ];
    case "flakeLockInvalidInputRef":
      return [
        `[flakeLockInvalidInputRef] ${failure.context}`,
        formatJsonValue(failure.got),
      ];
    case "githubGraphqlErrors":
      return [
        `[githubGraphqlErrors] GraphQL returned errors`,
        formatJsonValue(failure.response),
      ];
    case "unrecognizedPackage":
      return [`[unrecognizedPackage] ${failure.name}`];
    case "unrecognizedPackages":
      return [`[unrecognizedPackages] ${failure.names.join(", ")}`];
    case "invalidTagPrefix":
      return [
        `[invalidTagPrefix] ${failure.tagValue} (expected prefix ${failure.expectedPrefix})`,
      ];
    case "invalidTagEmptyVersion":
      return [`[invalidTagEmptyVersion] ${failure.tagValue}`];
    case "missingPackageName":
      return [
        `[missingPackageName] pass --pkg <name> (argv: ${
          failure.argv.join(" ")
        })`,
      ];
  }
}

export function runMain(program: Effect.Effect<void, AppError>): Promise<void> {
  return Effect.runPromiseExit(program).then((exit) =>
    Exit.match(exit, {
      onSuccess: () => {},
      onFailure: (cause) => {
        const failure = Cause.failureOption(cause);
        const lines = Option.match(failure, {
          onNone: () => [Cause.pretty(cause)],
          onSome: (error) => formatFailureLines(error),
        });
        for (const line of lines) {
          console.error(line);
        }
        Deno.exit(1);
      },
    })
  );
}
