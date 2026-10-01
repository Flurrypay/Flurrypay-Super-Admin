import { expect, test } from "@playwright/test";

import { json, mockApi, signIn, SUPER_ADMIN, SUPPORT_STAFF } from "./mock-api";

test.describe("treasury", () => {
  test("shows every balance the company holds, and what it owes customers", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/treasury");

    // Naira float, crypto reserves, liability and coverage — the four numbers
    // that together answer "can we meet withdrawals today?".
    await expect(page.getByText("₦48,250,300.55").first()).toBeVisible();
    await expect(page.getByText("₦1,200,000.00").first()).toBeVisible();
    await expect(page.getByText("₦47,050,300.55").first()).toBeVisible();
    // The reserves total is summed from the priced wallets only.
    await expect(page.getByText("₦285,696,682.00").first()).toBeVisible();
  });

  test("a fiat account's top-up shows where to actually send the money", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/treasury");

    const table = page.getByRole("table", { name: "Payout accounts" });
    await expect(table.getByText("Nomba settlement")).toBeVisible();
    await table.getByRole("button", { name: "Top up" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Fund the settlement account")).toBeVisible();
    // Unmasked on purpose: a masked number cannot be transferred to.
    await expect(dialog.getByText("5119947015")).toBeVisible();
    await expect(dialog.getByText("Nomba MFB")).toBeVisible();
  });

  test("switching the active payout account is super-admin only and needs a code", async ({
    page,
  }) => {
    let switched: unknown = null;
    await mockApi(page, SUPER_ADMIN, {
      "POST /flurrypay-website-admin-financial/payout-providers/switch": (route, _url, body) => {
        switched = body;
        return json(route, 200, { success: true, message: "Switched", data: {} });
      },
    });
    await signIn(page, SUPER_ADMIN, "/treasury");

    await page.getByRole("button", { name: "Make active" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Switch payout account" }).click();
    await expect(dialog.getByText(/6-digit code/)).toBeVisible();
    expect(switched).toBeNull();

    await dialog.getByLabel("Authenticator code").fill("123456");
    await dialog.getByRole("button", { name: "Switch payout account" }).click();

    await expect(page.getByText(/Customer payouts now leave from/)).toBeVisible();
    expect(switched).toEqual({ providerId: "pp-0002", twoFACode: "123456" });
  });

  test("staff who cannot withdraw are not offered the button", async ({ page }) => {
    // `wallets.withdraw` is excluded from the staff-grantable set entirely, so
    // the API would refuse — showing the button is an invitation to a refusal.
    await mockApi(page, {
      ...SUPPORT_STAFF,
      permissions: ["users.view", "treasury.view"],
    });
    await signIn(
      page,
      { ...SUPPORT_STAFF, permissions: ["users.view", "treasury.view"] },
      "/treasury?tab=reserves",
    );

    await expect(page.getByRole("table", { name: "Crypto reserves" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
    // Topping up is just an address — anyone who can see the treasury can see it.
    await expect(page.getByRole("button", { name: "Top up" }).first()).toBeVisible();
  });

  test("an unreadable reserve balance is reported, never shown as zero", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/treasury?tab=reserves");

    const table = page.getByRole("table", { name: "Crypto reserves" });
    await expect(table.getByText("Unavailable")).toBeVisible();
    await expect(page.getByText(/marked unavailable rather than shown as zero/)).toBeVisible();
  });

  test("a withdrawal names the destination and the ceiling before it is sent", async ({ page }) => {
    let sent: unknown = null;
    await mockApi(page, SUPER_ADMIN, {
      "POST /flurrypay-website-admin-wallet/resolve-recipient": (route) =>
        json(route, 200, {
          success: true,
          data: {
            kind: "external",
            via: "address",
            onChain: true,
            feeApplies: true,
            address: "TExternalAddressThatIsLongEnough",
            feeEstimate: { fee: 1.2, currency: "USDT" },
            note: "This address is outside Flurrypay.",
          },
        }),
      "POST /flurrypay-website-admin-wallet/withdrawal": (route, _url, body) => {
        sent = body;
        return json(route, 200, { message: "Sent", transactionReference: "PRV-1" });
      },
    });
    await signIn(page, SUPER_ADMIN, "/treasury?tab=reserves");

    await page
      .getByRole("table", { name: "Crypto reserves" })
      .getByRole("button", { name: "Withdraw" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");

    // The budget is on screen before the amount field, not discovered by refusal.
    await expect(dialog.getByText("₦3,750,000.00")).toBeVisible();

    await dialog.getByLabel("Amount (USDT)").fill("25");
    await dialog.getByLabel("Send to").fill("TExternalAddressThatIsLongEnough");

    // The irreversible nature of an external send is stated before sending.
    await expect(
      dialog.getByText("External address — this leaves the network for good"),
    ).toBeVisible();
    await expect(dialog.getByText(/Network fee about 1.2 USDT/)).toBeVisible();

    await dialog.getByRole("button", { name: "Withdraw" }).click();
    await expect(dialog.getByText("Enter your account password.")).toBeVisible();
    expect(sent).toBeNull();

    await dialog.getByLabel("Account password").fill("correct horse battery");
    await dialog.getByLabel("Transaction PIN").fill("111111");
    await dialog.getByLabel("Authenticator code").fill("222222");
    await dialog.getByRole("button", { name: "Withdraw" }).click();

    await expect(page.getByText("25 USDT sent")).toBeVisible();
    expect(sent).toMatchObject({
      currency: "usdt",
      amount: "25",
      address: "TExternalAddressThatIsLongEnough",
      password: "correct horse battery",
      pin: "111111",
      twoFACode: "222222",
    });
  });

  test("treasury movements separate money in from money out", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/treasury?tab=movements");

    const table = page.getByRole("table", { name: "Treasury movements" });
    await expect(table.getByText("Profit collection")).toBeVisible();
    await expect(table.getByText("Withdrawal")).toBeVisible();
    await expect(table.getByText("₦1,500,000.00")).toBeVisible();
  });
});

test.describe("balance before and after", () => {
  test("the ledger shows what each transaction did to the customer's balance", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/transactions");

    const table = page.getByRole("table", { name: "Transactions" });
    // Before and after together: either alone answers nothing.
    await expect(table.getByText("₦200,000.00")).toBeVisible();
    await expect(table.getByText("₦49,874.50")).toBeVisible();
  });

  test("the drawer breaks the movement into its separate ledger entries", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/transactions");

    await page.getByRole("table", { name: "Transactions" }).getByText("Naira withdrawal").click();
    const drawer = page.getByRole("dialog");

    const ledger = drawer.getByRole("table", { name: "Wallet ledger entries" });
    await expect(ledger.getByText("FIAT_WITHDRAWAL")).toBeVisible();
    // The principal and the fee are separate movements under one reference —
    // which is why a single before/after pair is not enough.
    await expect(ledger.getByText("TRANSFER_FEE")).toBeVisible();
    await expect(drawer.getByText(/2 movements under this reference/)).toBeVisible();
    await expect(drawer.getByText("-₦150,125.50")).toBeVisible();
  });

  test("a transaction that never touched the naira wallet says so, rather than showing zero", async ({
    page,
  }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/transactions");

    await page.getByRole("table", { name: "Transactions" }).getByText("Crypto buy").click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByText(/No naira movement is recorded against this reference/),
    ).toBeVisible();
  });
});
