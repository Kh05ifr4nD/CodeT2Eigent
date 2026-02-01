import type { JsonValue } from "./jsonTypes.ts";

export type AppError =
  | Readonly<{ tag: "missingEnv"; envKey: string }>
  | Readonly<{ tag: "invalidEnv"; envKey: string; value: string }>
  | Readonly<{ tag: "missingCommand"; args: ReadonlyArray<string> }>
  | Readonly<
    { tag: "commandSpawnFailed"; args: ReadonlyArray<string>; cause: string }
  >
  | Readonly<
    {
      tag: "commandNonZeroExit";
      args: ReadonlyArray<string>;
      exitCode: number;
      stdout: string;
      stderr: string;
    }
  >
  | Readonly<{ tag: "ioReadFailed"; path: string; cause: string }>
  | Readonly<{ tag: "ioWriteFailed"; path: string; cause: string }>
  | Readonly<{ tag: "ioAppendFailed"; path: string; cause: string }>
  | Readonly<{ tag: "httpNonOk"; url: string; status: number }>
  | Readonly<{ tag: "networkRequestFailed"; url: string; cause: string }>
  | Readonly<{ tag: "networkReadFailed"; url: string; cause: string }>
  | Readonly<{ tag: "invalidJson"; cause: string }>
  | Readonly<{ tag: "jsonExpectedObject"; context: string; got: JsonValue }>
  | Readonly<{ tag: "jsonExpectedArray"; context: string; got: JsonValue }>
  | Readonly<
    {
      tag: "jsonMissingField";
      context: string;
      field: string;
      objectKeys: ReadonlyArray<string>;
    }
  >
  | Readonly<
    {
      tag: "jsonFieldNotString";
      context: string;
      field: string;
      got: JsonValue;
    }
  >
  | Readonly<{ tag: "jsonFieldEmptyString"; context: string; field: string }>
  | Readonly<
    {
      tag: "jsonFieldNotNumber";
      context: string;
      field: string;
      got: JsonValue;
    }
  >
  | Readonly<
    { tag: "flakeLockInvalidInputRef"; context: string; got: JsonValue }
  >
  | Readonly<{ tag: "githubGraphqlErrors"; response: JsonValue }>
  | Readonly<{ tag: "unrecognizedPackage"; name: string }>
  | Readonly<{ tag: "unrecognizedPackages"; names: ReadonlyArray<string> }>
  | Readonly<
    { tag: "invalidTagPrefix"; tagValue: string; expectedPrefix: string }
  >
  | Readonly<{ tag: "invalidTagEmptyVersion"; tagValue: string }>
  | Readonly<{ tag: "missingPackageName"; argv: ReadonlyArray<string> }>;

export const appError = {
  missingEnv: (
    envKey: string,
  ): AppError => ({ tag: "missingEnv", envKey } as const),
  invalidEnv: (
    envKey: string,
    value: string,
  ): AppError => ({ tag: "invalidEnv", envKey, value } as const),
  missingCommand: (
    args: ReadonlyArray<string>,
  ): AppError => ({ tag: "missingCommand", args } as const),
  commandSpawnFailed: (
    args: ReadonlyArray<string>,
    cause: string,
  ): AppError => ({ tag: "commandSpawnFailed", args, cause } as const),
  commandNonZeroExit: (
    args: ReadonlyArray<string>,
    exitCode: number,
    stdout: string,
    stderr: string,
  ): AppError => ({
    tag: "commandNonZeroExit",
    args,
    exitCode,
    stdout,
    stderr,
  } as const),
  ioReadFailed: (
    path: string,
    cause: string,
  ): AppError => ({ tag: "ioReadFailed", path, cause } as const),
  ioWriteFailed: (
    path: string,
    cause: string,
  ): AppError => ({ tag: "ioWriteFailed", path, cause } as const),
  ioAppendFailed: (
    path: string,
    cause: string,
  ): AppError => ({ tag: "ioAppendFailed", path, cause } as const),
  httpNonOk: (
    url: string,
    status: number,
  ): AppError => ({ tag: "httpNonOk", url, status } as const),
  networkRequestFailed: (
    url: string,
    cause: string,
  ): AppError => ({ tag: "networkRequestFailed", url, cause } as const),
  networkReadFailed: (
    url: string,
    cause: string,
  ): AppError => ({ tag: "networkReadFailed", url, cause } as const),
  invalidJson: (
    cause: string,
  ): AppError => ({ tag: "invalidJson", cause } as const),
  jsonExpectedObject: (
    context: string,
    got: JsonValue,
  ): AppError => ({ tag: "jsonExpectedObject", context, got } as const),
  jsonExpectedArray: (
    context: string,
    got: JsonValue,
  ): AppError => ({ tag: "jsonExpectedArray", context, got } as const),
  jsonMissingField: (
    context: string,
    field: string,
    objectKeys: ReadonlyArray<string>,
  ): AppError => ({
    tag: "jsonMissingField",
    context,
    field,
    objectKeys,
  } as const),
  jsonFieldNotString: (
    context: string,
    field: string,
    got: JsonValue,
  ): AppError => ({ tag: "jsonFieldNotString", context, field, got } as const),
  jsonFieldEmptyString: (
    context: string,
    field: string,
  ): AppError => ({ tag: "jsonFieldEmptyString", context, field } as const),
  jsonFieldNotNumber: (
    context: string,
    field: string,
    got: JsonValue,
  ): AppError => ({ tag: "jsonFieldNotNumber", context, field, got } as const),
  flakeLockInvalidInputRef: (
    context: string,
    got: JsonValue,
  ): AppError => ({ tag: "flakeLockInvalidInputRef", context, got } as const),
  githubGraphqlErrors: (
    response: JsonValue,
  ): AppError => ({ tag: "githubGraphqlErrors", response } as const),
  unrecognizedPackage: (
    name: string,
  ): AppError => ({ tag: "unrecognizedPackage", name } as const),
  unrecognizedPackages: (
    names: ReadonlyArray<string>,
  ): AppError => ({ tag: "unrecognizedPackages", names } as const),
  invalidTagPrefix: (
    tagValue: string,
    expectedPrefix: string,
  ): AppError => ({
    tag: "invalidTagPrefix",
    tagValue,
    expectedPrefix,
  } as const),
  invalidTagEmptyVersion: (
    tagValue: string,
  ): AppError => ({ tag: "invalidTagEmptyVersion", tagValue } as const),
  missingPackageName: (
    argv: ReadonlyArray<string>,
  ): AppError => ({ tag: "missingPackageName", argv } as const),
} as const;
