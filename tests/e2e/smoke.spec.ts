import { expect, test } from "@playwright/test";

test("unauthenticated visitors are sent to sign-in, keeping their destination", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/transactions?status=FAILED");

  await expect(page).toHaveURL(/\/login\?next=%2Ftransactions%3Fstatus%3DFAILED/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  // Catches CSP violations and hydration errors, which surface as console errors.
  expect(errors).toEqual([]);
});

test("sign-in form validates before calling the API", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Enter your password")).toBeVisible();
});

test("responses carry security headers and a request ID", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();

  expect(headers["content-security-policy"]).toContain("script-src 'self' 'nonce-");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-request-id"]).toBeTruthy();
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok" });
});
