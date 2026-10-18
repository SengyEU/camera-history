/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { getCamera, getCameraLatest, getGroup, getImages } from "../api";

vi.mock("../api", () => ({
  getCamera: vi.fn(async () => ({ id: "cam-1", name: "Pláž", theme: "light", retentionMonths: 12 })),
  getImages: vi.fn(async () => [
    { id: "img-1", timestamp: "2026-09-18T09:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/090000.jpg" },
    { id: "img-2", timestamp: "2026-09-18T12:00:00Z", url: "/api/v1/cameras/cam-1/2026-09-18/120000.jpg" },
  ]),
  getGroup: vi.fn(),
  getCameraLatest: vi.fn(),
}));

beforeEach(() => {
  window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18");
});

afterEach(() => {
  cleanup();
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
    expect(screen.getByText(/img=img-1/)).toBeInTheDocument();
  });

  it("opens the shared image from an ?img deep link", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&img=img-2");
    render(<App />);
    expect(await screen.findByTestId("share-modal")).toBeInTheDocument();
    expect(screen.getByTestId("modal-image")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );
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

const summitGroup = {
  group: { id: "g1", name: "Summit", slug: "summit" },
  cameras: [
    { id: "cam-a", name: "Alpha", theme: "light" },
    { id: "cam-b", name: "Beta", theme: "dark" },
  ],
};

describe("App group widget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders group widget with camera dropdown and switches keeping date, falling back to latest", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-09");
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => {
      if (cameraId === "cam-a") {
        return [{ id: "i1", timestamp: `${date}T09:00:00Z`, url: "/api/v1/i1.jpg" }];
      }
      if (date === "2026-10-09") {
        return [{ id: "i2", timestamp: `${date}T08:00:00Z`, url: "/api/v1/i2.jpg" }];
      }
      return [];
    });

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByText("Summit")).toBeInTheDocument();
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getAllByText("Alpha")).toHaveLength(1);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select).toHaveAttribute("data-testid", "camera-switcher");
    expect(select.options.length).toBe(2);
    expect(select).toHaveValue("cam-a");
    expect(await screen.findByTestId("image-i1")).toBeInTheDocument();

    await user.selectOptions(select, "cam-b");

    expect(await screen.findByTestId("image-i2")).toBeInTheDocument();
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledWith("cam-b");
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("keeps the selected date when the switched camera has images for that date", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue(null);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      { id: `${cameraId}-${date}`, timestamp: `${date}T10:00:00Z`, url: `/api/v1/${cameraId}.jpg` },
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("image-cam-a-2026-10-10")).toBeInTheDocument();
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "cam-b");

    expect(await screen.findByTestId("image-cam-b-2026-10-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-10")).toBeInTheDocument();
    expect(vi.mocked(getCameraLatest)).not.toHaveBeenCalled();
  });

  it("fetches latest only once when already showing the latest date", async () => {
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockResolvedValue([]);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-09");

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    await waitFor(() => expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument());
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
  });

  it("shows empty state for a group with no cameras", async () => {
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g", name: "Empty", slug: "empty" },
      cameras: [],
    });

    window.history.pushState({}, "", "/group/t/empty");
    render(<App />);

    expect(await screen.findByTestId("group-empty")).toBeInTheDocument();
    expect(screen.getByText("No cameras in this group.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(vi.mocked(getImages)).not.toHaveBeenCalled();
  });
});