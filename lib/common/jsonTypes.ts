export type JsonValue =
  | string
  | number
  | boolean
  | JsonObject
  | JsonArray;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface JsonArray extends ReadonlyArray<JsonValue> {}
