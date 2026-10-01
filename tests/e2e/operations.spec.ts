import { expect, test } from "@playwright/test";

import { json, mockApi, signIn, SUPER_ADMIN, TEST_USERS } from "./mock-api";

test.describe("operations", () => {
  test("bulk suspend runs one audited call per customer and skips those already suspended", async ({
    page,
  }) => {
    const calls: { path: string; body: unknown }[] = [];
    await mockApi(page, SUPER_ADMIN, {
      // One code is exchanged for a grant that covers the whole run.
      "POST /flurrypay-website-admin/security/step-up": (route) =>
        json(route, 200, { grant: "test-grant", expiresAt: "2030-01-01T00:00:00.000Z" }),
      "POST /user/suspendUser/usr-0001": (route, url, body) => {
        calls.push({ path: url.pathname, body });
        return json(route, 200, { message: "User suspended" });
      },
    });
    await signIn(page, SUPER_ADMIN, "/users");

    await page.getByLabel("Select row usr-0001").check();
    await page.getByLabel("Select row usr-0002").check();
    await page.getByRole("button", { name: "Bulk actions" }).click();
    await page.getByRole("menuitem", { name: "Suspend transacting" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("1 already in that state will be skipped")).toBeVisible();
    await dialog.getByLabel("Reason").fill("Chargeback investigation in progress");
    await dialog.getByLabel("Authenticator code").fill("123456");
    await dialog.getByRole("button", { name: "Suspend transacting (1)" }).click();

    await expect(dialog.getByText("Finished: 1 of 1 processed.")).toBeVisible();
    await expect(dialog.getByText("Already in that state")).toBeVisible();
    expect(calls).toEqual([
      {
        path: "/user/suspendUser/usr-0001",
        body: { reason: "Chargeback investigation in progress" },
      },
    ]);
  });

  test("refunding a stranded transfer requires a note and an authenticator code", async ({
    page,
  }) => {
    let sent: unknown = null;
    await mockApi(page, SUPER_ADMIN, {
      "POST /flurrypay-website-admin-stranded/TEST-STRANDED-0001/refund": (route, _url, body) => {
        sent = body;
        return json(route, 200, { success: true, message: "₦20,000 returned to the customer." });
      },
    });
    await signIn(page, SUPER_ADMIN, "/operations/stranded");

    await expect(page.getByText("TEST-STRANDED-0001")).toBeVisible();
    await page.getByRole("button", { name: "Resolve" }).click();
    await page.getByRole("menuitem", { name: "Refund to customer" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Refund principal" }).click();
    await expect(dialog.getByText("Give a reason of at least 10 characters")).toBeVisible();
    expect(sent).toBeNull();

    await dialog.getByLabel("Note").fill("Provider dashboard shows the payout was never sent");
    await dialog.getByLabel("Authenticator code").fill("123456");
    await dialog.getByRole("button", { name: "Refund principal" }).click();

    await expect(page.getByText("₦20,000 returned to the customer.")).toBeVisible();
    expect(sent).toEqual({
      note: "Provider dashboard shows the payout was never sent",
      twoFACode: "123456",
    });
  });

  test("exporting all filtered customers walks the list endpoint with the filters applied", async ({
    page,
  }) => {
    const requests: { page: string | null; limit: string | null; status: string | null }[] = [];
    await mockApi(page, SUPER_ADMIN, {
      "GET /flurrypay-website-admin/users/search": (route, url) => {
        requests.push({
          page: url.searchParams.get("page"),
          limit: url.searchParams.get("limit"),
          status: url.searchParams.get("status"),
        });
        return json(route, 200, {
          data: TEST_USERS,
          pagination: { total: TEST_USERS.length, page: 1, limit: 200, totalPages: 1 },
        });
      },
    });
    await signIn(page, SUPER_ADMIN, "/users?status=active");

    await page.getByRole("button", { name: "Export" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /All filtered results/ }).check();
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/^flurrypay-users-.*\.csv$/);

    // The export page is requested at the endpoint's maximum limit, carrying the list filter.
    expect(requests.at(-1)).toMatchObject({ page: "1", limit: "200", status: "active" });
  });
});
