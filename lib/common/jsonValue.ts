import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, appError } from "./error.ts";
import type { JsonArray, JsonObject, JsonValue } from "./jsonTypes.ts";

export type { JsonArray, JsonObject, JsonValue } from "./jsonTypes.ts";

export function asObject(value: JsonValue): Option.Option<JsonObject> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Option.some(value as JsonObject);
  }
  return Option.none();
}

export function asArray(value: JsonValue): Option.Option<JsonArray> {
  if (Array.isArray(value)) {
    return Option.some(value);
  }
  return Option.none();
}

export function getField(
  object: JsonObject,
  key: string,
): Option.Option<JsonValue> {
  if (Object.prototype.hasOwnProperty.call(object, key)) {
    return Option.some(object[key] as JsonValue);
  }
  return Option.none();
}

export function getObjectField(
  object: JsonObject,
  key: string,
): Option.Option<JsonObject> {
  return Option.flatMap(getField(object, key), asObject);
}

export function getStringField(
  object: JsonObject,
  key: string,
): Option.Option<string> {
  return Option.flatMap(
    getField(object, key),
    (value) => typeof value === "string" ? Option.some(value) : Option.none(),
  );
}

export function getNumberField(
  object: JsonObject,
  key: string,
): Option.Option<number> {
  return Option.flatMap(
    getField(object, key),
    (value) => typeof value === "number" ? Option.some(value) : Option.none(),
  );
}

export function requireObjectValue(
  value: JsonValue,
  context: string,
): Effect.Effect<JsonObject, AppError> {
  const object = asObject(value);
  return Option.match(object, {
    onNone: () => Effect.fail(appError.jsonExpectedObject(context, value)),
    onSome: (present) => Effect.succeed(present),
  });
}

export function requireArrayValue(
  value: JsonValue,
  context: string,
): Effect.Effect<JsonArray, AppError> {
  const array = asArray(value);
  return Option.match(array, {
    onNone: () => Effect.fail(appError.jsonExpectedArray(context, value)),
    onSome: (present) => Effect.succeed(present),
  });
}

export function requireObjectField(
  object: JsonObject,
  field: string,
  context: string,
): Effect.Effect<JsonObject, AppError> {
  return Effect.flatMap(
    requireField(object, field, context),
    (value) => requireObjectValue(value, `${context}.${field}`),
  );
}

export function requireArrayField(
  object: JsonObject,
  field: string,
  context: string,
): Effect.Effect<JsonArray, AppError> {
  return Effect.flatMap(
    requireField(object, field, context),
    (value) => requireArrayValue(value, `${context}.${field}`),
  );
}

export function requireField(
  object: JsonObject,
  field: string,
  context: string,
): Effect.Effect<JsonValue, AppError> {
  const value = getField(object, field);
  return Option.match(value, {
    onNone: () =>
      Effect.fail(
        appError.jsonMissingField(context, field, Object.keys(object).sort()),
      ),
    onSome: (present) => Effect.succeed(present),
  });
}

export function requireStringField(
  object: JsonObject,
  field: string,
  context: string,
): Effect.Effect<string, AppError> {
  return Effect.flatMap(requireField(object, field, context), (value) => {
    if (typeof value !== "string") {
      return Effect.fail(appError.jsonFieldNotString(context, field, value));
    }
    return Effect.succeed(value);
  });
}

export function requireNonEmptyStringField(
  object: JsonObject,
  field: string,
  context: string,
): Effect.Effect<string, AppError> {
  return Effect.flatMap(requireStringField(object, field, context), (value) => {
    if (value.length === 0) {
      return Effect.fail(appError.jsonFieldEmptyString(context, field));
    }
    return Effect.succeed(value);
  });
}

export function requireNumberField(
  object: JsonObject,
  field: string,
  context: string,
): Effect.Effect<number, AppError> {
  return Effect.flatMap(requireField(object, field, context), (value) => {
    if (typeof value !== "number") {
      return Effect.fail(appError.jsonFieldNotNumber(context, field, value));
    }
    return Effect.succeed(value);
  });
}
