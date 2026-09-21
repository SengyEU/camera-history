import { expect, test } from "@playwright/test";

const CAMERA = { camera: { id: "cam-1", name: "Pláž", theme: "light", retentionMonths: 12 } };
const IMAGES = {
  images: [
    { id: "img-1", timestamp: "2026-09-18T09:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/090000.jpg" },
    { id: "img-2", timestamp: "2026-09-18T12:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/120000.jpg" },
  ],
};

test("widget loads images and opens modal", async ({ page }) => {
  await page.route("**/api/v1/cameras/cam-1", (route) => route.fulfill({ json: CAMERA }));
  await page.route("**/api/v1/cameras/cam-1/images?*", (route) => route.fulfill({ json: IMAGES }));
  await page.route("**/api/v1/cameras/cam-1/**/*.jpg", (route) =>
    route.fulfill({ body: Buffer.from([0xff, 0xd8, 0xff]), headers: { "content-type": "image/jpeg" } }),
  );

  await page.goto("/widget/acme/cam-1?date=2026-09-18");
  await expect(page.getByText("Pláž")).toBeVisible();
  await expect(page.getByTestId("image-img-1")).toBeVisible();
  await page.getByTestId("image-img-1").click();
  await expect(page.getByTestId("share-modal")).toBeVisible();
});