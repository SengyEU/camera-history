/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { getCamera, getCameraLatest, getGroup, getImages, type ImageDto } from "../api";

vi.mock("../api", () => ({
  getCamera: vi.fn(),
  getImages: vi.fn(),
  getGroup: vi.fn(),
  getCameraLatest: vi.fn(),
}));

const makeImage = (id: string, timestamp: string, url: string, isDaylight = true): ImageDto => ({
  id,
  timestamp,
  url,
  isDaylight,
});

const defaultImages: ImageDto[] = [
  makeImage("img-1", "2026-09-18T09:00:00", "/api/v1/cameras/cam-1/2026-09-18/090000.jpg"),
  makeImage("img-2", "2026-09-18T12:00:00", "/api/v1/cameras/cam-1/2026-09-18/120000.jpg"),
];

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const stubClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCamera).mockImplementation(async () => ({
    id: "cam-1",
    name: "Pláž",
    theme: "light",
    retentionMonths: 12,
  }));
  vi.mocked(getImages).mockImplementation(async () => defaultImages);
  vi.mocked(getCameraLatest).mockResolvedValue(null);
  window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("App widget", () => {
  it("renders the camera name and one frame per image", async () => {
    render(<App />);
    expect(await screen.findByText("Pláž")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId(/^frame-img-/)).toHaveLength(2));
    expect(screen.getByTestId("film-strip")).toBeInTheDocument();
  });

  it("shows viewer-local hour chips on the frames", async () => {
    render(<App />);
    const morning = await screen.findByTestId("frame-img-1");
    const noon = screen.getByTestId("frame-img-2");
    expect(morning).toHaveTextContent("9 AM");
    expect(morning.querySelector(".chip-h")).toHaveTextContent("9");
    expect(morning.querySelector(".chip-ap")).toHaveTextContent("AM");
    expect(noon).toHaveTextContent("12 PM");
    expect(noon.querySelector(".chip-h")).toHaveTextContent("12");
    expect(noon.querySelector(".chip-ap")).toHaveTextContent("PM");
  });

  it("expands a frame in place and collapses it again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-1"));

    const open = screen.getByTestId("frame-open");
    expect(open).toHaveTextContent("September 18, 2026 · 9 AM");
    expect(open.querySelector("img")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/090000.jpg",
    );
    expect(screen.queryByTestId("frame-img-1")).not.toBeInTheDocument();

    await user.click(open);
    expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument();
    expect(screen.getByTestId("frame-img-1")).toBeInTheDocument();
  });

  it("steps through the filtered list with the arrow buttons", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00", "/n1.jpg", false),
      makeImage("d2", "2026-09-18T12:00:00", "/d2.jpg"),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    expect(screen.getByTestId("frame-open")).toHaveTextContent("September 18, 2026 · 9 AM");
    expect(screen.queryByLabelText("Previous capture")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Next capture"));
    const open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");
    expect(open).toHaveTextContent("September 18, 2026 · 12 PM");

    await user.click(screen.getByLabelText("Previous capture"));
    expect(screen.getByTestId("frame-open")).toHaveTextContent("September 18, 2026 · 9 AM");
  });

  it("keeps the open frame when activating an arrow with the keyboard", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00", "/d1.jpg"),
      makeImage("d2", "2026-09-18T12:00:00", "/d2.jpg"),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    const next = screen.getByLabelText("Next capture");
    next.focus();
    expect(next).toHaveFocus();
    await user.keyboard("{Enter}");

    const open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");
    expect(open).toHaveTextContent("September 18, 2026 · 12 PM");
  });

  it("opens the share popup with network links and a copy field", async () => {
    const user = userEvent.setup();
    stubClipboard();
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-2"));
    await user.click(screen.getByTestId("share-open"));

    const popup = await screen.findByTestId("share-popup");
    expect(popup).toHaveTextContent("September 18, 2026 · 12 PM");

    const url = `${window.location.origin}/widget/acme/cam-1?date=2026-09-18&hour=12`;
    const encoded = encodeURIComponent(url);
    const networks: Array<[string, string]> = [
      ["Share on Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encoded}`],
      ["Share on X", `https://twitter.com/intent/tweet?text=${encoded}`],
      ["Share on WhatsApp", `https://wa.me/?text=${encoded}`],
      ["Share on Telegram", `https://t.me/share/url?url=${encoded}`],
    ];
    for (const [label, href] of networks) {
      const link = screen.getByLabelText(label);
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener");
    }

    const input = screen.getByDisplayValue(url);
    expect(input).toHaveAttribute("readonly");
    expect(screen.queryByDisplayValue(/camera=/)).not.toBeInTheDocument();
  });

  it("copies the share URL and reverts the label after two seconds", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-2"));
    await user.click(screen.getByTestId("share-open"));

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/widget/acme/cam-1?date=2026-09-18&hour=12`,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("closes the share popup via the close button, Esc and the overlay", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-1"));

    await user.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-popup")).toBeInTheDocument();
    await user.click(screen.getByTestId("share-close"));
    expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("share-open"));
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("share-open"));
    fireEvent.click(screen.getByTestId("share-overlay"));
    expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument();
  });

  it("opens the capture from an ?hour deep link", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=12");
    render(<App />);
    const open = await screen.findByTestId("frame-open");
    expect(open).toHaveTextContent("September 18, 2026 · 12 PM");
    expect(open.querySelector("img")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );
  });

  it("opens the capture from an older ?img deep link", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&img=img-2");
    render(<App />);
    const open = await screen.findByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );
  });

  it("gives ?hour precedence over ?img", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=9&img=img-2");
    render(<App />);
    const open = await screen.findByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/090000.jpg",
    );
  });

  it("changes the day from the date nav, refetches and clears the hour deep link", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=12");
    render(<App />);
    await screen.findByTestId("frame-open");

    await user.click(screen.getByLabelText("Next day"));
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-19"));
    expect(window.location.search).toBe("?date=2026-09-19");
    await waitFor(() => expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("2026-09-19")).toBeInTheDocument();

    const input = screen.getByLabelText("Date") as HTMLInputElement;
    expect(input.min).not.toBe("");
    expect(input.max).toBe(toLocalInput(new Date()));

    fireEvent.change(input, { target: { value: "2026-09-20" } });
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-20"));
    expect(screen.getByDisplayValue("2026-09-20")).toBeInTheDocument();
  });

  it("shows eight skeleton slivers while loading", async () => {
    vi.mocked(getImages).mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByTestId("film-strip")).toBeInTheDocument();
    expect(screen.getAllByTestId("film-skeleton")).toHaveLength(8);
    await screen.findByText("Pláž");
    expect(screen.getAllByTestId("film-skeleton")).toHaveLength(8);
  });

  it("switches to scroll mode for 29+ frames and keeps it while a frame is open", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(
      Array.from({ length: 29 }, (_, index) =>
        makeImage(`s${index}`, "2026-09-18T09:00:00", `/s${index}.jpg`),
      ),
    );
    render(<App />);
    const strip = await screen.findByTestId("film-strip");
    await waitFor(() => expect(strip).toHaveClass("film-strip-scroll"));

    await user.click(screen.getByTestId("frame-s0"));
    const open = screen.getByTestId("frame-open");
    expect(open).toHaveClass("frame-open");
    expect(strip).toHaveClass("film-strip-scroll");
    expect(open.closest(".film-strip-scroll")).toBe(strip);
  });

  it("shows the pinned empty copy for a day without images", async () => {
    vi.mocked(getImages).mockResolvedValue([]);
    render(<App />);
    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
  });

  it("hides night images by default and the night toggle reveals them", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00", "/n1.jpg", false),
    ]);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByTestId("frame-d1");

    const toggle = screen.getByTestId("night-toggle");
    expect(toggle).toHaveTextContent("Night images");
    expect(toggle).toHaveAttribute("role", "switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).not.toHaveAttribute("aria-pressed");
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("frame-n1")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();
  });

  it("treats a missing isDaylight flag as daylight", async () => {
    vi.mocked(getImages).mockResolvedValue([
      { id: "legacy", timestamp: "2026-09-18T09:00:00", url: "/legacy.jpg" } as ImageDto,
    ]);
    render(<App />);

    expect(await screen.findByTestId("frame-legacy")).toBeInTheDocument();
    expect(screen.getByTestId("night-toggle")).toHaveAttribute("aria-checked", "false");
  });

  it("offers Show night images when every capture is a night shot", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("n1", "2026-09-18T22:00:00", "/n1.jpg", false),
    ]);
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("Every capture today is a night shot.")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("show-night"));
    expect(screen.getByTestId("frame-n1")).toBeInTheDocument();
    expect(screen.queryByText("Every capture today is a night shot.")).not.toBeInTheDocument();
    expect(screen.getByTestId("night-toggle")).toHaveAttribute("aria-checked", "true");
  });

  it("applies the camera theme as data-theme", async () => {
    vi.mocked(getCamera).mockResolvedValueOnce({
      id: "cam-1",
      name: "Pláž",
      theme: "forest",
      retentionMonths: 12,
    });
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
    vi.mocked(getCamera).mockResolvedValueOnce({
      id: "cam-1",
      name: "Pláž",
      theme: "forest",
      retentionMonths: 12,
    });
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
  it("renders the camera switcher and keeps the date on switch", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByText("Summit")).toBeInTheDocument();
    const select = screen.getByTestId("camera-switcher") as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select).toHaveValue("cam-a");
    expect(await screen.findByTestId("frame-cam-a-2026-10-10")).toBeInTheDocument();

    await user.selectOptions(select, "cam-b");
    expect(await screen.findByTestId("frame-cam-b-2026-10-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-10")).toBeInTheDocument();
    expect(vi.mocked(getCameraLatest)).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to the latest date once when the camera has no images", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-09");
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => {
      if (cameraId === "cam-a") {
        return [makeImage("i1", `${date}T09:00:00`, "/api/v1/i1.jpg")];
      }
      if (date === "2026-10-09") {
        return [makeImage("i2", `${date}T08:00:00`, "/api/v1/i2.jpg")];
      }
      return [];
    });

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("frame-i1")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-b");

    expect(await screen.findByTestId("frame-i2")).toBeInTheDocument();
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledWith("cam-b");
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
  });

  it("fetches latest only once when the fallback lands on the latest date", async () => {
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

  it("does not loop when the switched camera has no images on the selected or latest date", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-09");
    vi.mocked(getImages).mockImplementation(async (cameraId) =>
      cameraId === "cam-a"
        ? [makeImage("i1", "2026-10-10T09:00:00", "/api/v1/i1.jpg")]
        : [],
    );

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("frame-i1")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-b");

    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
    expect(vi.mocked(getImages)).toHaveBeenCalledTimes(3);
  });

  it("shows an empty state for a group with no cameras", async () => {
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g", name: "Empty", slug: "empty" },
      cameras: [],
    });

    window.history.pushState({}, "", "/group/t/empty");
    render(<App />);

    expect(await screen.findByTestId("group-empty")).toBeInTheDocument();
    expect(screen.getByText("No cameras in this group.")).toBeInTheDocument();
    expect(screen.queryByTestId("camera-switcher")).not.toBeInTheDocument();
    expect(vi.mocked(getImages)).not.toHaveBeenCalled();
  });

  it("clears the open capture and share popup when the camera changes", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    await user.click(await screen.findByTestId("frame-cam-a-2026-10-10"));
    expect(screen.getByTestId("frame-open")).toBeInTheDocument();
    await user.click(screen.getByTestId("share-open"));
    expect(screen.getByTestId("share-popup")).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-b");

    expect(await screen.findByTestId("frame-cam-b-2026-10-10")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument();
  });

  it("includes the selected camera in the share link", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    await user.selectOptions(await screen.findByTestId("camera-switcher"), "cam-b");
    await user.click(await screen.findByTestId("frame-cam-b-2026-10-10"));
    await user.click(screen.getByTestId("share-open"));

    const input = screen.getByDisplayValue(/camera=cam-b/) as HTMLInputElement;
    const url = new URL(input.value);
    expect(url.pathname).toBe("/group/t/summit");
    expect(url.searchParams.get("camera")).toBe("cam-b");
    expect(url.searchParams.get("date")).toBe("2026-10-10");
    expect(url.searchParams.get("hour")).toBe("9");
  });

  it("opens the camera named by ?camera on load", async () => {
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10&camera=cam-b");
    render(<App />);

    const select = await screen.findByTestId("camera-switcher");
    await waitFor(() => expect(select).toHaveValue("cam-b"));
    expect(await screen.findByTestId("frame-cam-b-2026-10-10")).toBeInTheDocument();
    expect(vi.mocked(getImages)).toHaveBeenCalledWith("cam-b", "2026-10-10");
  });

  it("falls back to the first camera when ?camera names an unknown camera", async () => {
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10&camera=nope");
    render(<App />);

    const select = await screen.findByTestId("camera-switcher");
    await waitFor(() => expect(select).toHaveValue("cam-a"));
    expect(await screen.findByTestId("frame-cam-a-2026-10-10")).toBeInTheDocument();
  });
});
