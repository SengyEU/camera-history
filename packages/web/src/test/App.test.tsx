/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import {
  getCamera,
  getCameraLatest,
  getGroup,
  getImages,
  type ImageDto,
  type PublicCamera,
  type PublicGroup,
} from "../api";

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

const makeCamera = (overrides: Partial<PublicCamera> = {}): PublicCamera => ({
  id: "cam-1",
  name: "Pláž",
  theme: "light",
  retentionMonths: 12,
  showNight: false,
  timezone: "UTC",
  ...overrides,
});

const defaultImages: ImageDto[] = [
  makeImage("img-1", "2026-09-18T09:00:00Z", "/api/v1/cameras/cam-1/2026-09-18/090000.jpg"),
  makeImage("img-2", "2026-09-18T12:00:00Z", "/api/v1/cameras/cam-1/2026-09-18/120000.jpg"),
];

const cameraDate = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const fireSwipe = (element: Element, fromX: number, toX: number, pointerType = "touch") => {
  for (const [type, clientX] of [
    ["pointerDown", fromX],
    ["pointerUp", toX],
  ] as const) {
    const event = createEvent[type](element, {});
    Object.defineProperties(event, {
      pointerType: { value: pointerType },
      pointerId: { value: 1 },
      clientX: { value: clientX },
      clientY: { value: 10 },
    });
    fireEvent(element, event);
  }
};

const threeImages = () => [
  makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
  makeImage("d2", "2026-09-18T12:00:00Z", "/d2.jpg"),
  makeImage("d3", "2026-09-18T15:27:00Z", "/d3.jpg"),
];

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
  vi.mocked(getCamera).mockResolvedValue(makeCamera());
  vi.mocked(getImages).mockResolvedValue(defaultImages);
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

  it("shows camera-timezone hour chips on the frames", async () => {
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

  it("places the date nav above the film strip", async () => {
    render(<App />);
    await screen.findByTestId("frame-img-1");
    const nav = screen.getByTestId("date-nav");
    const strip = screen.getByTestId("film-strip");
    expect(nav.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
      makeImage("d2", "2026-09-18T12:00:00Z", "/d2.jpg"),
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
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("d2", "2026-09-18T12:00:00Z", "/d2.jpg"),
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

  it("plays through the visible frames every 700ms and auto-pauses at the last", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    const play = screen.getByTestId("play-toggle");
    expect(play).toHaveAttribute("aria-label", "Play time-lapse");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(play);
    });
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Pause time-lapse");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    let open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");
    expect(open).toHaveTextContent("September 18, 2026 · 12 PM");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d3.jpg");
    expect(open).toHaveTextContent("September 18, 2026 · 3 PM");
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Play time-lapse");

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d3.jpg");
  });

  it("stops playing when the toggle is clicked again", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByTestId("play-toggle"));
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d2.jpg");

    act(() => {
      fireEvent.click(screen.getByTestId("play-toggle"));
    });
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Play time-lapse");
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d2.jpg");
  });

  it("pauses time-lapse when share opens or the user navigates manually", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByTestId("play-toggle"));
    });
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Pause time-lapse");

    act(() => {
      fireEvent.click(screen.getByTestId("share-open"));
    });
    expect(screen.getByTestId("share-popup")).toBeInTheDocument();
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Play time-lapse");
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d1.jpg");

    act(() => {
      fireEvent.click(screen.getByTestId("share-close"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByTestId("play-toggle"));
    });
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Pause time-lapse");
    act(() => {
      fireEvent.click(screen.getByLabelText("Next capture"));
    });
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Play time-lapse");
    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d2.jpg");
  });

  it("does not carry the play state across date changes", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));
    await user.click(screen.getByTestId("play-toggle"));
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Pause time-lapse");

    await user.click(screen.getByLabelText("Next day"));
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-19"));
    await user.click(await screen.findByTestId("frame-d1"));
    expect(screen.getByTestId("play-toggle")).toHaveAttribute("aria-label", "Play time-lapse");
  });

  it("navigates the open frame with ArrowLeft and ArrowRight", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    fireEvent.keyDown(document, { key: "ArrowRight" });
    let open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d3.jpg");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d3.jpg");

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");

    await user.click(screen.getByTestId("share-open"));
    const input = screen.getByLabelText("Share URL");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d2.jpg");
  });

  it("navigates with horizontal touch swipes on the open frame", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    fireSwipe(screen.getByTestId("frame-open"), 200, 140);
    let open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");

    fireSwipe(screen.getByTestId("frame-open"), 140, 200);
    open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d1.jpg");

    fireSwipe(screen.getByTestId("frame-open"), 200, 140, "mouse");
    expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d1.jpg");
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

  it("labels captures and share links in the camera timezone", async () => {
    const user = userEvent.setup();
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ timezone: "America/Edmonton" }));
    vi.mocked(getImages).mockResolvedValue([
      makeImage("e1", "2026-10-18T00:12:00Z", "/e1.jpg"),
    ]);
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-10-17&hour=18");
    render(<App />);

    const open = await screen.findByTestId("frame-open");
    expect(open).toHaveTextContent("October 17, 2026 · 6 PM");
    expect(open.querySelector("img")).toHaveAttribute("src", "/e1.jpg");

    await user.click(screen.getByTestId("share-open"));
    expect(screen.getByTestId("share-popup")).toHaveTextContent("October 17, 2026 · 6 PM");
    const shareUrl = new URL((screen.getByLabelText("Share URL") as HTMLInputElement).value);
    expect(shareUrl.searchParams.get("date")).toBe("2026-10-17");
    expect(shareUrl.searchParams.get("hour")).toBe("18");
  });

  it("falls back to the viewer timezone until camera metadata loads", async () => {
    const timestamp = "2026-10-18T00:12:00Z";
    let resolveCamera!: (camera: PublicCamera) => void;
    vi.mocked(getCamera).mockImplementation(
      () =>
        new Promise<PublicCamera>((resolve) => {
          resolveCamera = resolve;
        }),
    );
    vi.mocked(getImages).mockResolvedValue([makeImage("e1", timestamp, "/e1.jpg")]);
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-10-17");
    render(<App />);

    const before = await screen.findByTestId("frame-e1");
    const viewerLabel = new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true,
    });
    expect(before).toHaveTextContent(viewerLabel);

    await act(async () => {
      resolveCamera(makeCamera({ timezone: "America/Edmonton" }));
    });

    await waitFor(() => expect(screen.getByTestId("frame-e1")).toHaveTextContent("6 PM"));
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
    const expectClosed = () =>
      waitFor(() => expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument());
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-1"));

    await user.click(screen.getByTestId("share-open"));
    expect(await screen.findByTestId("share-popup")).toBeInTheDocument();
    await user.click(screen.getByTestId("share-close"));
    await expectClosed();

    await user.click(screen.getByTestId("share-open"));
    await user.keyboard("{Escape}");
    await expectClosed();

    await user.click(screen.getByTestId("share-open"));
    fireEvent.click(screen.getByTestId("share-overlay"));
    await expectClosed();
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

  it("opens nothing for a night ?hour deep link when the camera hides night images", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
    ]);
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=22");
    render(<App />);

    expect(await screen.findByTestId("frame-d1")).toBeInTheDocument();
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument());
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();
  });

  it("opens a night ?hour deep link when the camera shows night images", async () => {
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ showNight: true }));
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
    ]);
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=22");
    render(<App />);

    const open = await screen.findByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/n1.jpg");
  });

  it("keeps a day deep link open when camera metadata resolves after the images", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
    ]);
    let resolveCamera!: (camera: PublicCamera) => void;
    vi.mocked(getCamera).mockImplementation(
      () =>
        new Promise<PublicCamera>((resolve) => {
          resolveCamera = resolve;
        }),
    );
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=9");
    render(<App />);

    const before = await screen.findByTestId("frame-open");
    expect(before.querySelector("img")).toHaveAttribute("src", "/d1.jpg");

    await act(async () => {
      resolveCamera(makeCamera({ showNight: false }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/d1.jpg"),
    );
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();
  });

  it("re-matches the ?hour deep link once the camera timezone is known", async () => {
    const e1Timestamp = "2026-10-18T00:12:00Z";
    const e2Timestamp = "2026-10-18T18:12:00Z";
    vi.mocked(getImages).mockResolvedValue([
      makeImage("e1", e1Timestamp, "/e1.jpg"),
      makeImage("e2", e2Timestamp, "/e2.jpg"),
    ]);
    let resolveCamera!: (camera: PublicCamera) => void;
    vi.mocked(getCamera).mockImplementation(
      () =>
        new Promise<PublicCamera>((resolve) => {
          resolveCamera = resolve;
        }),
    );
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-10-17&hour=18");
    render(<App />);

    await screen.findByTestId("frame-e1");
    const viewerMatches = [e1Timestamp, e2Timestamp].some(
      (timestamp) => new Date(timestamp).getHours() === 18,
    );
    if (viewerMatches) {
      const before = await screen.findByTestId("frame-open");
      expect(before.querySelector("img")).toHaveAttribute(
        "src",
        new Date(e1Timestamp).getHours() === 18 ? "/e1.jpg" : "/e2.jpg",
      );
    }

    await act(async () => {
      resolveCamera(makeCamera({ timezone: "America/Edmonton" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("frame-open").querySelector("img")).toHaveAttribute("src", "/e1.jpg"),
    );
    expect(screen.getByTestId("frame-open")).toHaveTextContent("October 17, 2026 · 6 PM");
  });

  it("opens nothing when the ?hour deep link has no matching capture", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=7");
    render(<App />);

    expect(await screen.findByTestId("frame-img-1")).toBeInTheDocument();
    expect(screen.getByTestId("film-strip")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument();
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
    expect(input.max).toBe(cameraDate(new Date(), "UTC"));

    fireEvent.change(input, { target: { value: "2026-09-20" } });
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-20"));
    expect(screen.getByDisplayValue("2026-09-20")).toBeInTheDocument();
  });

  it("defaults the date to today in the camera timezone when the URL has no date", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-18T05:30:00Z"));
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ timezone: "America/Edmonton" }));
    window.history.pushState({}, "", "/widget/acme/cam-1");
    render(<App />);

    const input = screen.getByLabelText("Date") as HTMLInputElement;
    await waitFor(() => expect(input).toHaveValue("2026-10-17"));
    expect(input.max).toBe("2026-10-17");
    await waitFor(() =>
      expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-10-17"),
    );
  });

  it("does not fetch the default day until the camera timezone is known", async () => {
    let resolveCamera!: (camera: PublicCamera) => void;
    vi.mocked(getCamera).mockImplementation(
      () =>
        new Promise<PublicCamera>((resolve) => {
          resolveCamera = resolve;
        }),
    );
    window.history.pushState({}, "", "/widget/acme/cam-1");
    render(<App />);

    expect(screen.getAllByTestId("film-skeleton")).toHaveLength(8);
    expect(screen.queryByText("No images for this date.")).not.toBeInTheDocument();
    expect(vi.mocked(getImages)).not.toHaveBeenCalled();

    await act(async () => {
      resolveCamera(makeCamera({ timezone: "America/Edmonton" }));
    });

    await waitFor(() =>
      expect(vi.mocked(getImages)).toHaveBeenCalledWith(
        "cam-1",
        cameraDate(new Date(), "America/Edmonton"),
      ),
    );
  });

  it("settles on the viewer-timezone date when camera metadata fails", async () => {
    vi.mocked(getCamera).mockRejectedValue(new Error("meta down"));
    vi.mocked(getImages).mockResolvedValue([]);
    window.history.pushState({}, "", "/widget/acme/cam-1");
    render(<App />);

    await waitFor(() => expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0));
    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    expect(vi.mocked(getImages)).toHaveBeenCalledWith(
      "cam-1",
      cameraDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    );
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
        makeImage(`s${index}`, "2026-09-18T09:00:00Z", `/s${index}.jpg`),
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
    expect(screen.queryByTestId("day-only-empty")).not.toBeInTheDocument();
  });

  it("shows all night frames when the camera shows night images", async () => {
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ showNight: true }));
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
    ]);
    render(<App />);

    expect(await screen.findByTestId("frame-d1")).toBeInTheDocument();
    expect(screen.getByTestId("frame-n1")).toBeInTheDocument();
  });

  it("hides night frames when the camera does not show night images", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("d1", "2026-09-18T09:00:00Z", "/d1.jpg"),
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
    ]);
    render(<App />);

    expect(await screen.findByTestId("frame-d1")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();
  });

  it("shows the day-only empty copy when every capture is a night shot", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("n1", "2026-09-18T22:00:00Z", "/n1.jpg", false),
    ]);
    render(<App />);

    expect(await screen.findByTestId("day-only-empty")).toHaveTextContent(
      "No daytime captures for this date.",
    );
    expect(screen.queryByTestId("frame-n1")).not.toBeInTheDocument();
    expect(screen.queryByText("No images for this date.")).not.toBeInTheDocument();
  });

  it("treats a missing isDaylight flag as daylight", async () => {
    vi.mocked(getImages).mockResolvedValue([
      { id: "legacy", timestamp: "2026-09-18T09:00:00Z", url: "/legacy.jpg" } as ImageDto,
    ]);
    render(<App />);

    expect(await screen.findByTestId("frame-legacy")).toBeInTheDocument();
  });

  it("applies the camera theme as data-theme", async () => {
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ theme: "forest" }));
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
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ theme: "forest" }));
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=neon");
    render(<App />);
    await screen.findByText("Pláž");
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
  });
});

const summitGroup = {
  group: { id: "g1", name: "Summit", slug: "summit" },
  cameras: [
    { id: "cam-a", name: "Alpha", theme: "light", timezone: "UTC", showNight: false },
    { id: "cam-b", name: "Beta", theme: "dark", timezone: "UTC", showNight: false },
  ],
};

describe("App group widget", () => {
  it("renders the camera switcher and keeps the date on switch", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
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

  it("uses the selected camera's timezone for labels and share links", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g1", name: "Summit", slug: "summit" },
      cameras: [
        { id: "cam-a", name: "Alpha", theme: "light", timezone: "UTC", showNight: false },
        {
          id: "cam-b",
          name: "Beta",
          theme: "dark",
          timezone: "America/Edmonton",
          showNight: false,
        },
      ],
    });
    vi.mocked(getImages).mockResolvedValue([
      makeImage("e1", "2026-10-18T00:12:00Z", "/e1.jpg"),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-17");
    render(<App />);

    const alphaFrame = await screen.findByTestId("frame-e1");
    expect(alphaFrame).toHaveTextContent("12 AM");

    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-b");
    await waitFor(() => expect(screen.getByTestId("frame-e1")).toHaveTextContent("6 PM"));

    await user.click(screen.getByTestId("frame-e1"));
    expect(screen.getByTestId("frame-open")).toHaveTextContent("October 17, 2026 · 6 PM");
    await user.click(screen.getByTestId("share-open"));
    expect(screen.getByTestId("share-popup")).toHaveTextContent("October 17, 2026 · 6 PM");
    const url = new URL((screen.getByLabelText("Share URL") as HTMLInputElement).value);
    expect(url.searchParams.get("hour")).toBe("18");
  });

  it("resyncs night visibility when switching cameras", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g1", name: "Summit", slug: "summit" },
      cameras: [
        { id: "cam-a", name: "Alpha", theme: "light", timezone: "UTC", showNight: true },
        { id: "cam-b", name: "Beta", theme: "dark", timezone: "UTC", showNight: false },
      ],
    });
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}-d`, `${date}T09:00:00Z`, `/api/v1/${cameraId}-d.jpg`),
      makeImage(
        `${cameraId}-${date}-n`,
        `${date}T22:00:00Z`,
        `/api/v1/${cameraId}-n.jpg`,
        false,
      ),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("frame-cam-a-2026-10-10-n")).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-b");
    expect(await screen.findByTestId("frame-cam-b-2026-10-10-d")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-cam-b-2026-10-10-n")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-a");
    expect(await screen.findByTestId("frame-cam-a-2026-10-10-n")).toBeInTheDocument();
  });

  it("falls back to the latest date once when the camera has no images", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-09");
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => {
      if (cameraId === "cam-a") {
        return [makeImage("i1", `${date}T09:00:00Z`, "/api/v1/i1.jpg")];
      }
      if (date === "2026-10-09") {
        return [makeImage("i2", `${date}T08:00:00Z`, "/api/v1/i2.jpg")];
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
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
  });

  it("does not loop when the switched camera has no images on the selected or latest date", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-09");
    vi.mocked(getImages).mockImplementation(async (cameraId) =>
      cameraId === "cam-a"
        ? [makeImage("i1", "2026-10-10T09:00:00Z", "/api/v1/i1.jpg")]
        : [],
    );

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("frame-i1")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("camera-switcher"), "cam-b");

    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
    expect(vi.mocked(getImages)).toHaveBeenCalledTimes(3);
  });

  it("does not fetch the default day until the group and selected camera load", async () => {
    let resolveGroup!: (group: PublicGroup) => void;
    vi.mocked(getGroup).mockImplementation(
      () =>
        new Promise<PublicGroup>((resolve) => {
          resolveGroup = resolve;
        }),
    );
    window.history.pushState({}, "", "/group/t/summit");
    render(<App />);

    expect(screen.getAllByTestId("film-skeleton")).toHaveLength(8);
    expect(vi.mocked(getImages)).not.toHaveBeenCalled();

    await act(async () => {
      resolveGroup(summitGroup);
    });

    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getImages)).toHaveBeenCalledWith("cam-a", cameraDate(new Date(), "UTC"));
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
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
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
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
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
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
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
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10&camera=nope");
    render(<App />);

    const select = await screen.findByTestId("camera-switcher");
    await waitFor(() => expect(select).toHaveValue("cam-a"));
    expect(await screen.findByTestId("frame-cam-a-2026-10-10")).toBeInTheDocument();
  });
});
