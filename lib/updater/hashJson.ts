import * as Effect from "effect/Effect";
import type { AppError } from "../common/error.ts";
import { readTextFile } from "../common/fs.ts";
import { parseJsonText } from "../common/json.ts";
import {
  requireNonEmptyStringField,
  requireObjectValue,
} from "../common/jsonValue.ts";

export function readHashJsonVersion(
  path: URL,
): Effect.Effect<string, AppError> {
  return Effect.flatMap(
    readTextFile(path),
    (text) =>
      Effect.flatMap(parseJsonText(text), (json) =>
        Effect.flatMap(
          requireObjectValue(json, path.pathname),
          (object) =>
            requireNonEmptyStringField(object, "version", path.pathname),
        )),
  );
}
