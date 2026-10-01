"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldValues, useForm, type UseFormProps } from "react-hook-form";
import type { z } from "zod";

/**
 * React Hook Form bound to a Zod schema. Field values are typed from the
 * schema's input, and `handleSubmit` receives the parsed output.
 */
export function useZodForm<Input extends FieldValues, Output extends FieldValues>(
  schema: z.ZodType<Output, Input>,
  options?: Omit<UseFormProps<Input, unknown, Output>, "resolver">,
) {
  return useForm<Input, unknown, Output>({
    mode: "onTouched",
    ...options,
    resolver: zodResolver(schema),
  });
}
