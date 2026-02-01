import type { JsonValue } from "./jsonTypes.ts";

export type ErrorLike =
  | Error
  | JsonValue
  | Readonly<{ message: string }>
  | Readonly<{ toString(): string }>;

export function asErrorMessage(value: ErrorLike): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message: string }).message;
    return typeof message === "string" ? message : "error";
  }
  return "error";
}
