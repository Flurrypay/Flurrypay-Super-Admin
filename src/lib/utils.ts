import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Composes class names, resolving conflicting Tailwind utilities in favour of the last one. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
