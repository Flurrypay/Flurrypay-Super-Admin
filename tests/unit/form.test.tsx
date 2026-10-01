import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UseFormSetError } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useZodForm } from "@/hooks/use-zod-form";
import { ValidationError } from "@/lib/api/errors";
import { applyFieldErrors } from "@/lib/validation";
import { email } from "@/schemas";

const schema = z.object({ email });
type FormValues = z.input<typeof schema>;

function TestForm({
  onSubmit,
  onReady,
}: {
  onSubmit: (values: z.output<typeof schema>) => void;
  onReady?: (setError: UseFormSetError<FormValues>) => void;
}) {
  const form = useZodForm(schema, { defaultValues: { email: "" } });
  onReady?.(form.setError);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}

describe("form infrastructure", () => {
  it("validates with the schema and links errors to the field accessibly", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    const input = screen.getByLabelText("Email");
    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("Enter a valid email address");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(message.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits parsed output", async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "  Ops@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ email: "ops@example.com" });
  });

  it("maps server field errors onto the form", async () => {
    let setError: UseFormSetError<FormValues> | undefined;
    render(
      <TestForm
        onSubmit={vi.fn()}
        onReady={(fn) => {
          setError = fn;
        }}
      />,
    );

    const error = new ValidationError({
      message: "422",
      userMessage: "Invalid",
      fieldErrors: { email: ["Email is already registered"] },
    });

    let applied = false;
    act(() => {
      if (setError) applied = applyFieldErrors(error, setError);
    });

    expect(applied).toBe(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("Email is already registered");
  });
});
