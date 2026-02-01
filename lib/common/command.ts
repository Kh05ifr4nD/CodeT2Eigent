import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { type AppError, appError } from "./error.ts";
import { asErrorMessage, type ErrorLike } from "./format.ts";

export type IoMode = "inherit" | "piped";

export type CommandOptions = Readonly<{
  cwd: Option.Option<string>;
  env: Readonly<Record<string, string>>;
  stdout: IoMode;
  stderr: IoMode;
}>;

export const defaultCommandOptions: CommandOptions = {
  cwd: Option.none(),
  env: {},
  stdout: "piped",
  stderr: "piped",
};

export type CommandResult = Readonly<{
  code: number;
  stdout: string;
  stderr: string;
}>;

export function runCommandRaw(
  args: ReadonlyArray<string>,
  options: CommandOptions,
): Effect.Effect<CommandResult, AppError> {
  const command = args[0];
  if (!command) {
    return Effect.fail(appError.missingCommand(args));
  }

  const cwdPart = Option.match(options.cwd, {
    onNone: () => ({}),
    onSome: (path) => ({ cwd: path }),
  });

  const process = new Deno.Command(command, {
    args: args.slice(1),
    ...cwdPart,
    env: { ...options.env },
    stdout: options.stdout,
    stderr: options.stderr,
  });

  return Effect.async((resume) => {
    process.output().then(
      (output) => {
        const stdout = options.stdout === "piped"
          ? new TextDecoder().decode(output.stdout)
          : "";
        const stderr = options.stderr === "piped"
          ? new TextDecoder().decode(output.stderr)
          : "";
        resume(Effect.succeed({ code: output.code, stdout, stderr }));
      },
      (reason: ErrorLike) => {
        resume(
          Effect.fail(
            appError.commandSpawnFailed(args, asErrorMessage(reason)),
          ),
        );
      },
    );
  });
}

export function runCommand(
  args: ReadonlyArray<string>,
  options: CommandOptions,
): Effect.Effect<string, AppError> {
  return Effect.flatMap(runCommandRaw(args, options), (result) => {
    if (result.code !== 0) {
      return Effect.fail(
        appError.commandNonZeroExit(
          args,
          result.code,
          result.stdout,
          result.stderr,
        ),
      );
    }
    return Effect.succeed(result.stdout);
  });
}
