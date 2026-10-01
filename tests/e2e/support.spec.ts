import { expect, test } from "@playwright/test";

import { type Handler, json, mockApi, signIn, SUPER_ADMIN } from "./mock-api";

const APPEAL = {
  id: "sup-appeal-0001",
  type: "appeal",
  name: "Test Customer",
  email: "test.customer@example.com",
  subject: "Locked out after changing phone",
  message: "I changed my number and now I cannot sign in. Please help.",
  explanation: "I changed my number and now I cannot sign in. Please help.",
  reasonForAppeal: "Locked out after changing phone",
  category: null,
  fileUrl: null,
  status: "pending",
  readByAdmin: false,
  replies: [],
  userId: "usr-0001",
  number: "+2348010000000",
  submittedAt: "2026-09-22T08:00:00.000Z",
};

const CHAT_ROOM = {
  id: "room-0001",
  roomId: "U_usr-0001_A_adm-super-0001",
  userId: "usr-0001",
  userName: "Test Customer",
  userEmail: "test.customer@example.com",
  lastMessage: "Still waiting on the refund, any update?",
  lastMessageAt: "2026-09-22T11:00:00.000Z",
  lastMessageFromAdmin: false,
  unreadCount: 2,
  createdAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-22T11:00:00.000Z",
};

function supportMocks(
  capture: { replied?: unknown; status?: unknown; chat?: unknown; read?: string[] } = {},
): Record<string, Handler> {
  capture.read ??= [];
  return {
    "GET /flurrypay-website-admin-support": (route) =>
      json(route, 200, {
        data: [APPEAL],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        summary: { totalAppeals: 1, totalContact: 0, unread: 1 },
      }),
    "GET /flurrypay-website-admin-support/appeal/sup-appeal-0001": (route) =>
      json(route, 200, { data: APPEAL }),
    "PATCH /flurrypay-website-admin-support/appeal/sup-appeal-0001/read": (route, url) => {
      capture.read?.push(url.pathname);
      return json(route, 200, { message: "Marked as read." });
    },
    "POST /flurrypay-website-admin-support/appeal/sup-appeal-0001/reply": (route, _url, body) => {
      capture.replied = body;
      return json(route, 200, { message: "Reply sent successfully.", data: APPEAL });
    },
    "PATCH /flurrypay-website-admin-support/appeal/sup-appeal-0001/status": (route, _url, body) => {
      capture.status = body;
      return json(route, 200, { data: { ...APPEAL, status: "approved" } });
    },
    "GET /flurrypay-website-admin-chat/admin/rooms": (route) =>
      json(route, 200, { rooms: [CHAT_ROOM], page: 1, limit: 20, total: 1, totalPages: 1 }),
    "GET /flurrypay-website-admin-chat/admin/room/U_usr-0001_A_adm-super-0001": (route) =>
      json(route, 200, {
        messages: [
          {
            id: "msg-0001",
            roomId: CHAT_ROOM.roomId,
            senderId: "usr-0001",
            message: "Still waiting on the refund, any update?",
            read: false,
            createdAt: "2026-09-22T11:00:00.000Z",
          },
        ],
        user: {
          id: "usr-0001",
          firstName: "Test",
          lastName: "Customer",
          email: "test.customer@example.com",
        },
      }),
    "POST /flurrypay-website-admin-chat/admin/reply": (route, _url, body) => {
      capture.chat = body;
      return json(route, 201, { message: "Reply sent", chat: { id: "msg-0002" } });
    },
  };
}

test.describe("support", () => {
  test("opening an appeal marks it read, and a reply is emailed only once it is long enough", async ({
    page,
  }) => {
    const capture: { replied?: unknown; read?: string[] } = {};
    await mockApi(page, SUPER_ADMIN, supportMocks(capture));
    await signIn(page, SUPER_ADMIN, "/support");

    await expect(page.getByText("Locked out after changing phone")).toBeVisible();
    await expect(page.getByText("1 unread · 1 appeals · 0 contact")).toBeVisible();

    await page
      .getByRole("cell", { name: /Test Customer/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", { name: "Locked out after changing phone" }),
    ).toBeVisible();

    // Opening the thread is itself the read. The admin never pressed anything.
    await expect.poll(() => capture.read?.length ?? 0).toBeGreaterThan(0);

    const send = drawer.getByRole("button", { name: "Send reply" });
    await expect(send).toBeDisabled();
    await drawer.getByLabel(/^Reply to/).fill("Too short");
    await expect(send).toBeDisabled();
    expect(capture.replied).toBeUndefined();

    await drawer
      .getByLabel(/^Reply to/)
      .fill("We've reset the number on your account — try signing in again.");
    await send.click();

    await expect(page.getByText("Reply emailed to the customer")).toBeVisible();
    expect(capture.replied).toEqual({
      message: "We've reset the number on your account — try signing in again.",
    });
  });

  test("an appeal can be approved or rejected, but never marked resolved", async ({ page }) => {
    const capture: { status?: unknown } = {};
    await mockApi(page, SUPER_ADMIN, supportMocks(capture));
    await signIn(page, SUPER_ADMIN, "/support?message=appeal%3Asup-appeal-0001");

    // Deep-linked straight to the thread, as the notification bell does.
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", { name: "Locked out after changing phone" }),
    ).toBeVisible();

    // "Resolved" describes a contact message, not an appeal: it would hide
    // whether the account was actually given back.
    await expect(drawer.getByRole("button", { name: "Resolved" })).toHaveCount(0);

    await drawer.getByRole("button", { name: "Approved" }).click();
    await expect(page.getByText("Status updated")).toBeVisible();
    expect(capture.status).toEqual({ status: "approved" });
  });

  test("live chat shows who spoke last and sends a reply into the room", async ({ page }) => {
    const capture: { chat?: unknown } = {};
    await mockApi(page, SUPER_ADMIN, supportMocks(capture));
    await signIn(page, SUPER_ADMIN, "/support?tab=chat");

    await page.getByRole("button", { name: /Test Customer/ }).click();
    await expect(page.getByText("Still waiting on the refund, any update?").first()).toBeVisible();
    // Authorship is announced, not just implied by alignment and colour.
    await expect(page.getByText("From Test Customer")).toBeAttached();

    await page
      .getByLabel(/^Reply to/)
      .fill("The refund went out this morning — it should land today.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect
      .poll(() => capture.chat)
      .toEqual({
        roomId: "U_usr-0001_A_adm-super-0001",
        message: "The refund went out this morning — it should land today.",
      });
  });
});

test.describe("transaction flags", () => {
  test("a flag needs a note, and clearing it needs a resolution", async ({ page }) => {
    let flagged: unknown = null;
    await mockApi(page, SUPER_ADMIN, {
      "POST /transactions/admin/tx-0002/flag": (route, _url, body) => {
        flagged = body;
        return json(route, 200, { success: true, message: "Transaction flagged for review." });
      },
    });
    await signIn(page, SUPER_ADMIN, "/transactions");

    // tx-0001 arrives already flagged from the fixture, so the ledger shows the
    // open flag without anyone having to raise one first.
    const table = page.getByRole("table", { name: "Transactions" });
    await expect(table.getByText("Suspected fraud")).toBeVisible();

    await table.getByText("Crypto buy").click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "Flag for review" }).click();

    const dialog = page.getByRole("dialog").filter({ hasText: "Flag for review" }).last();
    await dialog.getByRole("button", { name: "Flag transaction" }).click();
    await expect(dialog.getByText(/at least 10 characters/)).toBeVisible();
    expect(flagged).toBeNull();

    await dialog
      .getByLabel("What you noticed")
      .fill("Second purchase of this size within ten minutes on a new device.");
    await dialog.getByRole("button", { name: "Flag transaction" }).click();

    await expect(page.getByText("Transaction flagged for review")).toBeVisible();
    expect(flagged).toEqual({
      reason: "SUSPECTED_FRAUD",
      severity: "MEDIUM",
      note: "Second purchase of this size within ten minutes on a new device.",
    });
  });

  test("an open flag is explained on the transaction, and never changes its status", async ({
    page,
  }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN, "/transactions");

    const table = page.getByRole("table", { name: "Transactions" });
    await table.getByText("Naira withdrawal").click();
    const drawer = page.getByRole("dialog");

    await expect(drawer.getByText("Flagged for review")).toBeVisible();
    await expect(
      drawer.getByText("Third transfer to the same new beneficiary within the hour."),
    ).toBeVisible();
    await expect(drawer.getByText("The customer is not shown this")).toBeVisible();
    // The flag is an annotation. A failed transaction still reads as failed.
    await expect(drawer.getByText("Failed", { exact: true })).toBeVisible();
  });
});

test.describe("notifications", () => {
  test("the bell offers the full list even when the inbox is empty", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN);
    await signIn(page, SUPER_ADMIN);

    await page.getByRole("button", { name: /^Notifications/ }).click();
    // Scoped to the popover: the overview page has its own "View all" links.
    const bell = page.getByRole("dialog");
    await expect(bell.getByText("You're all caught up")).toBeVisible();
    await bell.getByRole("link", { name: "View all" }).click();

    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  });

  test("a notification opens what it is about", async ({ page }) => {
    await mockApi(page, SUPER_ADMIN, {
      "GET /flurrypay-website-admin-notifications": (route) =>
        json(route, 200, {
          notifications: [
            {
              id: "ntf-0001",
              title: "KYC submissions waiting",
              body: "Level 2 documents are waiting for review.",
              type: "info",
              priority: "high",
              targetRole: "all",
              read: false,
              entityType: "kyc",
              entityId: "usr-0001",
              link: null,
              createdAt: "2026-09-22T09:00:00.000Z",
            },
          ],
          unread: 1,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
      "PATCH /flurrypay-website-admin-notifications/read/ntf-0001": (route) =>
        json(route, 200, { message: "Notification marked as read" }),
    });
    await signIn(page, SUPER_ADMIN);

    await page.getByRole("button", { name: /^Notifications, 1 unread/ }).click();
    await page.getByRole("button", { name: /Open KYC review/ }).click();

    // The customer's own KYC tab, not the queue of everyone else's.
    await expect(page).toHaveURL(/\/users\/usr-0001\?tab=kyc/);
  });
});
