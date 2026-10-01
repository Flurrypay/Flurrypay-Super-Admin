// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { submitEmailCode, submitPassword } from "@/features/auth/api";
import { sessionStore } from "@/features/auth/session";
import { adminApi } from "@/lib/api/admin-client";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

// A JWT whose payload is { "exp": 4102444800 } (year 2100); the signature is irrelevant client-side.
const TOKEN = `x.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.y`;

afterEach(() => {
  sessionStore.end("signed-out");
});

describe("login state machine", () => {
  it("maps each API response shape to a login step", async () => {
    respond(200, { message: "A confirmation mail has been sent" });
    await expect(submitPassword({ email: "a@b.c", password: "x" })).resolves.toEqual({
      kind: "email-code",
    });

    respond(200, { requires2FA: true, email: "a@b.c", message: "Email verified." });
    await expect(submitEmailCode({ email: "a@b.c", code: "1234" })).resolves.toEqual({
      kind: "totp",
      email: "a@b.c",
    });

    respond(200, {
      requiresDeviceVerification: true,
      email: "a@b.c",
      challengeToken: "c",
      message: "…",
    });
    await expect(submitEmailCode({ email: "a@b.c", code: "1234" })).resolves.toMatchObject({
      kind: "device-challenge",
      challengeToken: "c",
    });

    respond(200, { message: "Admin verified successfully", token: TOKEN });
    await expect(submitEmailCode({ email: "a@b.c", code: "1234" })).resolves.toEqual({
      kind: "authenticated",
      token: TOKEN,
    });
  });

  it("reads the session expiry from the token", () => {
    sessionStore.start(TOKEN);
    expect(sessionStore.getState().session?.expiresAt).toBe(4102444800 * 1000);
  });
});

describe("session handling", () => {
  it("keeps the session when a step-up credential is rejected with 401", async () => {
    sessionStore.start(TOKEN);
    respond(401, { message: "Invalid two-factor authentication code.", code: "ADMIN_2FA_INVALID" });
    await expect(adminApi.post("/flurrypay-website-admin/create", {})).rejects.toThrow();
    expect(sessionStore.getState().session).not.toBeNull();
  });

  it("ends the session when the API terminates it", async () => {
    sessionStore.start(TOKEN);
    respond(401, { message: "Your session has been terminated.", code: "SESSION_TERMINATED" });
    await expect(adminApi.get("/flurrypay-website-admin/details")).rejects.toThrow();
    expect(sessionStore.getState()).toEqual({ session: null, endReason: "terminated" });
  });

  it("sends the bearer token and no credentials header the API's CORS policy would reject", async () => {
    sessionStore.start(TOKEN);
    respond(200, {});
    await adminApi.get("/flurrypay-website-admin/details");
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(init?.credentials).toBe("include");
    const allowed = [
      "content-type",
      "authorization",
      "x-requested-with",
      "x-request-id",
      "clientid",
      "accept",
      "origin",
      "cache-control",
    ];
    headers.forEach((_value, key) => {
      expect(allowed).toContain(key);
    });
  });
});
