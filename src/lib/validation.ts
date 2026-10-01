import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { z } from "zod";

import { type FieldErrors, ValidationError } from "@/lib/api/errors";

/**
 * Parses untrusted input (Server Action payloads, route params, search params)
 * and throws a ValidationError with the same field-error shape the API uses,
 * so client and server validation surface identically in forms.
 */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  throw new ValidationError({
    message: "Input failed schema validation",
    userMessage: "Some fields are invalid. Please review and try again.",
    fieldErrors: z.flattenError(result.error).fieldErrors as FieldErrors,
    details: result.error.issues,
  });
}

/**
 * Maps a server-side ValidationError onto React Hook Form fields.
 * Returns true when at least one field error was applied; otherwise the caller
 * should show `error.userMessage` as a form-level message.
 */
export function applyFieldErrors<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
): boolean {
  if (!(error instanceof ValidationError)) return false;

  const entries = Object.entries(error.fieldErrors).filter(([, messages]) => messages.length > 0);
  for (const [field, messages] of entries) {
    setError(field as Path<TFieldValues>, { type: "server", message: messages[0] });
  }
  return entries.length > 0;
}
