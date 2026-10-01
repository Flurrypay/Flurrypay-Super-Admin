import { expect, test } from "@playwright/test";

import { json, mockApi, signIn, SUPER_ADMIN, SUPPORT_STAFF } from "./mock-api";

test.describe("console with a mocked API", () => {
  test("super admin signs in through email code and TOTP and lands on the overview", async ({
    page,
  }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN);

    await expect(page.getByRole("heading", { name: "Welcome back, Test" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Failed · today/ })).toContainText("1");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const item of [
      "Overview",
      "Transactions",
      "KYC review",
      "Users",
      "Audit log",
      "Administrators",
      "Security",
    ]) {
      await expect(nav.getByRole("link", { name: item })).toBeVisible();
    }
  });

  test("staff only see the modules their permissions allow, and deep links are refused", async ({
    page,
  }) => {
    await mockApi(page, SUPPORT_STAFF);
    await signIn(page, SUPPORT_STAFF);

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Transactions" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Administrators" })).toHaveCount(0);

    await page.goto("/administrators");
    await expect(page.getByText("You don't have access to this section")).toBeVisible();
  });

  test("transactions: exact amounts, URL-persisted filters and a quick-view drawer", async ({
    page,
  }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/transactions");

    const table = page.getByRole("table", { name: "Transactions" });
    await expect(table.getByText("₦150,075.50")).toBeVisible();
    await expect(table.getByText("0.00012345 BTC")).toBeVisible();

    await page.getByRole("combobox", { name: "Status" }).click();
    await page.getByRole("option", { name: "Failed" }).click();
    await expect(page).toHaveURL(/status=FAILED/);
    await expect(table.getByText("0.00012345 BTC")).toHaveCount(0);

    await table.getByText("Naira withdrawal").click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Beneficiary bank unavailable")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      "/transactions/TEST-REF-0001",
    );
  });

  test("users list never renders fields outside the allowlist", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/users");
    await expect(page.getByRole("link", { name: "Test Customer" })).toBeVisible();
    await expect(page.getByText("must-not-render")).toHaveCount(0);
  });

  test("a rejected 2FA code on a step-up action shows on the field and keeps the session", async ({
    page,
  }) => {
    await mockApi(page, SUPER_ADMIN, {
      "POST /flurrypay-website-admin/create": (route) =>
        json(route, 401, {
          message: "Invalid two-factor authentication code.",
          code: "ADMIN_2FA_INVALID",
        }),
    });
    await signIn(page, SUPER_ADMIN, "/administrators");

    await page.getByRole("button", { name: "Invite administrator" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("First name").fill("New");
    await dialog.getByLabel("Last name").fill("Staff");
    await dialog.getByLabel("Work email").fill("new.staff@example.com");
    await dialog.getByLabel("Username").fill("newstaff");
    await dialog.getByLabel("Your authenticator code").fill("111111");
    await dialog.getByRole("button", { name: "Send invitation" }).click();

    await expect(dialog.getByText("Invalid two-factor authentication code.")).toBeVisible();
    await expect(page).toHaveURL(/\/administrators$/);
  });

  test("keyboard: Ctrl+K opens search and G then U goes to Users", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN);
    await expect(page.getByRole("heading", { name: "Welcome back, Test" })).toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(
      page.getByPlaceholder("Search customers, references, addresses, pages…"),
    ).toBeFocused();
    await page.keyboard.press("Escape");

    await page.keyboard.press("g");
    await page.keyboard.press("u");
    await expect(page).toHaveURL(/\/users$/);
  });

  test("a full page reload keeps the admin signed in on the same page", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/users");
    await expect(page.getByRole("link", { name: "Test Customer" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole("link", { name: "Test Customer" })).toBeVisible();
  });

  test("a session terminated by the API returns the admin to sign-in with an explanation", async ({
    page,
  }) => {
    let terminated = false;
    await mockApi(page, SUPER_ADMIN, {
      "GET /flurrypay-website-admin/users/search": (route) =>
        terminated
          ? json(route, 401, {
              message: "Your session has been terminated.",
              code: "SESSION_TERMINATED",
            })
          : json(route, 200, { data: [], pagination: { total: 0, page: 1, limit: 50 } }),
    });
    await signIn(page, SUPER_ADMIN);
    await expect(page.getByRole("heading", { name: "Welcome back, Test" })).toBeVisible();

    terminated = true;
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText("Your session ended because this account signed in elsewhere."),
    ).toBeVisible();
  });
});
