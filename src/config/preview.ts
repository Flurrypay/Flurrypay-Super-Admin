import { env } from "@/env";

/**
 * True when the console runs on built-in sample data: no API calls and no
 * sign-in. See `src/preview`. Controlled by NEXT_PUBLIC_PREVIEW_MODE.
 */
export const PREVIEW_MODE = env.NEXT_PUBLIC_PREVIEW_MODE;
