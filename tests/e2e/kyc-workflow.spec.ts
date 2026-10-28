import { expect, test } from "@playwright/test";

import { json, mockApi, signIn, SUPER_ADMIN } from "./mock-api";

const stamp = "2026-10-28T12:00:00Z";
const addressImage = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#f8fafc"/><text x="24" y="48" font-family="sans-serif" font-size="18" fill="#0f172a">Retained address document</text><text x="24" y="84" font-family="sans-serif" font-size="13" fill="#64748b">Synthetic test record</text><text x="24" y="112" font-family="sans-serif" font-size="13" fill="#64748b">2 Previous Street</text></svg>').toString("base64")}`;
const summary = { all: 3, ready: 1, actionRequired: 1, legacy: 1 };
const legacy = {
  id: "k-legacy",
  userId: "u-legacy",
  currentLevel: 1,
  dailyWithdrawalLimit: 200000,
  user: { firstName: "Legacy", lastName: "Merchant", email: "legacy@example.test" },
  bvn: "33333333333",
  level1Status: "VERIFIED",
  level2Status: "PENDING",
  level3Status: "NOT_STARTED",
  proofOfAddressDocumentUrl: addressImage,
  residentialAddress: "2 Previous Street",
  proofOfAddressType: "utility_bill",
  review: {
    category: "LEGACY",
    canApprove: false,
    legacySubmission: true,
    retainedAddressDocument: true,
    missingSteps: [
      "Verify BVN automatically",
      "Verify NIN against the BVN record",
      "Complete live capture against the verified NIN photo",
      "Submit the address document for Level 3 review",
    ],
  },
};
const ready = {
  id: "k-ready",
  userId: "u-ready",
  currentLevel: 2,
  dailyWithdrawalLimit: 500000,
  user: { firstName: "Ada", lastName: "Okafor", email: "ada@example.test" },
  bvn: "11111111111",
  nin: "22222222222",
  level1Status: "VERIFIED",
  level2Status: "VERIFIED",
  level3Status: "PENDING",
  bvnVerifiedAt: stamp,
  ninVerifiedAt: stamp,
  verifiedFirstName: "Ada",
  verifiedLastName: "Okafor",
  verifiedBirthdate: "1990-02-15",
  verifiedGender: "female",
  proofOfAddressDocumentUrl: addressImage,
  residentialAddress: "1 Test Street",
  proofOfAddressType: "utility_bill",
  faceMatchVerifiedAt: stamp,
  livenessCheckPassed: true,
  livenessCheckUrl: addressImage,
  faceMatchScore: 98,
  review: {
    category: "READY",
    canApprove: true,
    legacySubmission: false,
    retainedAddressDocument: true,
    missingSteps: [],
  },
};
function row(raw: typeof legacy | typeof ready) {
  const linked = raw.userId === "u-ready";
  return {
    ...raw,
    updatedAt: stamp,
    level1: {
      status: raw.level1Status,
      bvn: raw.bvn,
      providerVerified: linked,
      verifiedFirstName: raw.user.firstName,
      verifiedLastName: raw.user.lastName,
    },
    level2: {
      status: raw.level2Status,
      nin: linked ? "22222222222" : null,
      identityMatched: linked,
    },
    level3: {
      status: raw.level3Status,
      canApprove: raw.review.canApprove,
      submitted: true,
      documentUrl: addressImage,
      residentialAddress: raw.residentialAddress,
      proofOfAddressType: "utility_bill",
      livenessCheckPassed: linked,
      identityReference: linked ? "VERIFIED_NIN" : null,
    },
  };
}

test("KYC dashboard exposes actionable legacy records on desktop and mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockApi(page, SUPER_ADMIN, {
    "GET /kyc/admin/list": (route, url) => {
      const filter = url.searchParams.get("filter");
      const data =
        filter === "legacy" || filter === "action_required" ? [row(legacy)] : [row(ready)];
      return json(route, 200, {
        success: true,
        total: data.length,
        summary,
        data: url.searchParams.get("summaryOnly") === "true" ? [] : data,
      });
    },
    "GET /kyc/admin/user/u-legacy": (route) =>
      json(route, 200, {
        success: true,
        data: { raw: legacy, dailySpent: 0, remainingDailyLimit: 200000 },
      }),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, SUPER_ADMIN, "/kyc");
  await expect(
    page.getByRole("heading", { name: "One connected identity. Three clear steps." }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "KYC profiles" }).getByText("Ada Okafor"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("verification-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Legacy submissions.*Previous flow/ }).click();
  await expect(page).toHaveURL(/filter=legacy/);
  const table = page.getByRole("table", { name: "KYC profiles" });
  await expect(table.getByText("Legacy Merchant")).toBeVisible();
  await expect(table.getByText("Ada Okafor")).toHaveCount(0);
  await table.getByText("Legacy Merchant").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Legacy submission · follow-up required")).toBeVisible();
  await expect(
    drawer
      .getByRole("region", { name: "Required verification steps" })
      .getByText("Verify NIN against the BVN record"),
  ).toBeVisible();
  await expect(drawer.getByRole("img", { name: "Proof of address" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("legacy-review-desktop.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "One connected identity. Three clear steps." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("verification-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > window.innerWidth && !el.closest("table");
      })
      .map((el) => ({ tag: el.tagName, classes: el.className }))
      .slice(0, 12),
  }));
  await testInfo.attach("mobile-layout", {
    body: JSON.stringify(layout),
    contentType: "application/json",
  });
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  await table.getByText("Legacy Merchant").click();
  await expect(drawer.getByText("Legacy submission · follow-up required")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("legacy-review-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
