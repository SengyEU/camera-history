import { expect, test } from "@playwright/test";

const CAMERA = {
  camera: {
    id: "cam-1",
    name: "Pláž",
    theme: "light",
    retentionMonths: 12,
    timezone: "UTC",
    showNight: false,
  },
};
const IMAGES = {
  images: [
    { id: "img-1", timestamp: "2026-09-18T09:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/090000.jpg", isDaylight: true },
    { id: "img-2", timestamp: "2026-09-18T12:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/120000.jpg", isDaylight: true },
  ],
};

test("widget loads filmstrip and opens share popup", async ({ page }) => {
  await page.route("**/api/v1/cameras/cam-1", (route) => route.fulfill({ json: CAMERA }));
  await page.route("**/api/v1/cameras/cam-1/images?*", (route) => route.fulfill({ json: IMAGES }));
  await page.route("**/api/v1/cameras/cam-1/**/*.jpg", (route) =>
    route.fulfill({ body: Buffer.from([0xff, 0xd8, 0xff]), headers: { "content-type": "image/jpeg" } }),
  );

  await page.goto("/widget/acme/cam-1?date=2026-09-18");
  await expect(page.getByText("Pláž")).toBeVisible();
  await expect(page.getByTestId("film-strip")).toBeVisible();
  await expect(page.getByTestId("frame-img-1")).toBeVisible();
  await expect(page.getByTestId("frame-img-2")).toBeVisible();

  await page.getByTestId("frame-img-1").click();
  await expect(page.getByTestId("frame-open")).toBeVisible();

  await page.getByTestId("share-open").click();
  await expect(page.getByTestId("share-popup")).toBeVisible();
  await expect(page.getByLabel("Share URL")).toHaveValue(/date=2026-09-18/);
  await expect(page.getByLabel("Share URL")).toHaveValue(/hour=\d+/);
});
