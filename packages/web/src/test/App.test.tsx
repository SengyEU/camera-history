import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { getCamera } from "../api";

vi.mock("../api", () => ({
  getCamera: vi.fn(async () => ({ id: "cam-1", name: "Pláž", theme: "light", retentionMonths: 12 })),
  getImages: vi.fn(async () => [
    { id: "img-1", timestamp: "2026-09-18T09:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/090000.jpg" },
    { id: "img-2", timestamp: "2026-09-18T12:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/120000.jpg" },
  ]),
}));

beforeEach(() => {
  window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18");
});

describe("App widget", () => {
  it("renders camera name and images", async () => {
    render(<App />);
    expect(await screen.findByText("Pláž")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId(/^image-img-/)).toHaveLength(2));
  });

  it("opens modal on image click and copies share link", async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = await screen.findByTestId("image-img-1");
    await user.click(first);
    expect(await screen.findByTestId("share-modal")).toBeInTheDocument();
    const copy = screen.getByText("Copy link");
    await user.click(copy);
    expect(screen.getByText(/date=2026-09-18/)).toBeInTheDocument();
  });

  it("applies the camera theme as data-theme", async () => {
    vi.mocked(getCamera).mockResolvedValueOnce({ id: "cam-1", name: "Pláž", theme: "forest", retentionMonths: 12 });
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("forest");
  });

  it("overrides the theme via ?theme", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=midnight");
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "midnight"));
  });

  it("falls back to the camera theme when ?theme is unknown", async () => {
    vi.mocked(getCamera).mockResolvedValueOnce({ id: "cam-1", name: "Pláž", theme: "forest", retentionMonths: 12 });
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=neon");
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
  });
});