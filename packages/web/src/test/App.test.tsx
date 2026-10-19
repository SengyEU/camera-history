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

const chooseCamera = async (id: string) => {
  const switcher = await screen.findByTestId("camera-switcher");
  await userEvent.click(switcher);
  await userEvent.click(await screen.findByTestId(`camera-option-${id}`));
};

class ImageStub {
  static autoResolve = true;
  static instances: ImageStub[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private currentSrc = "";

  constructor() {
    ImageStub.instances.push(this);
  }

  set src(value: string) {
    this.currentSrc = value;
    if (ImageStub.autoResolve) {
      queueMicrotask(() => this.onload?.());
    }
  }

  get src() {
    return this.currentSrc;
  }

  static reset() {
    ImageStub.autoResolve = true;
    ImageStub.instances = [];
  }
}

const stubClipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
};

const stubPointer = (coarse: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: ((query: string) => ({
      matches: coarse && query.includes("pointer: coarse"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: coarse ? 5 : 0,
    configurable: true,
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  ImageStub.reset();
  vi.stubGlobal("Image", ImageStub);
  vi.mocked(getCamera).mockResolvedValue(makeCamera());
  vi.mocked(getImages).mockResolvedValue(defaultImages);
  vi.mocked(getCameraLatest).mockResolvedValue(null);
  window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
  Reflect.deleteProperty(window.navigator, "maxTouchPoints");
  Reflect.deleteProperty(window.navigator, "share");
});

describe("App widget", () => {
  it("renders one frame per image without a title or header", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByTestId(/^frame-img-/)).toHaveLength(2));
    expect(screen.getByTestId("film-strip")).toBeInTheDocument();
    expect(screen.queryByText("Pláž")).not.toBeInTheDocument();
    expect(document.querySelector(".widget-title")).toBeNull();
    expect(document.querySelector(".widget-header")).toBeNull();
  });

  it("shows camera-timezone hour chips on the frames", async () => {
    render(<App />);
    const morning = await screen.findByTestId("frame-img-1");
    const noon = screen.getByTestId("frame-img-2");
    expect(morning).toHaveTextContent("9 AM");
    expect(morning.querySelector(".frame-hours")).toHaveTextContent("9 AM");
    expect(morning.querySelector(".chip-h")).toHaveTextContent("9");
    expect(morning.querySelector(".chip-ap")).toHaveTextContent("AM");
    expect(noon).toHaveTextContent("12 PM");
    expect(noon.querySelector(".chip-h")).toHaveTextContent("12");
    expect(noon.querySelector(".chip-ap")).toHaveTextContent("PM");
  });

  it("places the date nav below the film strip", async () => {
    render(<App />);
    await screen.findByTestId("frame-img-1");
    const nav = screen.getByTestId("date-nav");
    const strip = screen.getByTestId("film-strip");
    expect(strip.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("expands a frame in place and collapses it again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-1"));

    const open = screen.getByTestId("frame-open");
    expect(open.querySelector(".frame-osd")).toHaveTextContent("September 18, 2026 · 9 AM");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/090000.jpg",
    );
    expect(screen.queryByTestId("frame-img-1")).not.toBeInTheDocument();

    await user.click(open);
    expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument();
    expect(screen.getByTestId("frame-img-1")).toBeInTheDocument();
  });

  it("keeps the departing capture visible while the columns reflow", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);

    await user.click(await screen.findByTestId("frame-d1"));
    await user.click(screen.getByLabelText("Next capture"));

    const departing = screen.getByTestId("frame-d1");
    expect(departing).toHaveClass("frame-closing");
    expect(departing.querySelector("img")).toHaveAttribute("src", "/d1.jpg");
    expect(departing.querySelector(".frame-hours")).toHaveTextContent("9 AM");
    expect(departing.style.backgroundImage).toContain("/d1.jpg");
    expect(screen.getByTestId("film-strip")).toHaveClass("film-strip-step");
    const open = screen.getByTestId("frame-open");
    expect(open.querySelector("img")).toHaveAttribute("src", "/d2.jpg");
    expect(open).toHaveClass("frame-quiet");

    await waitFor(() => expect(departing).not.toHaveClass("frame-closing"), { timeout: 2000 });
    expect(departing.querySelector("img")).toBeNull();
    expect(screen.getByTestId("film-strip")).not.toHaveClass("film-strip-step");
    expect(screen.getByTestId("frame-open")).toHaveClass("frame-quiet");
  });

  it("keeps the full image while a frame collapses", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByTestId("frame-img-1"));
    await user.click(screen.getByTestId("frame-open"));

    const collapsing = screen.getByTestId("frame-img-1");
    expect(collapsing).toHaveClass("frame-closing");
    expect(collapsing.querySelector("img")).toBeInTheDocument();
    expect(collapsing.querySelector(".frame-hours")).toHaveTextContent("9 AM");
    expect(collapsing.style.backgroundImage).toContain(
      "/api/v1/cameras/cam-1/2026-09-18/090000.jpg",
    );
    expect(screen.getByTestId("film-strip")).toHaveClass("film-strip-close");

    await waitFor(() => expect(collapsing).not.toHaveClass("frame-closing"), { timeout: 2000 });
    expect(collapsing.querySelector("img")).toBeNull();
    expect(collapsing.style.backgroundImage).toContain(
      "/api/v1/cameras/cam-1/2026-09-18/090000.jpg",
    );
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
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d2.jpg");
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
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d2.jpg");
    expect(open).toHaveTextContent("September 18, 2026 · 12 PM");
  });

  it("navigates the open frame with ArrowLeft and ArrowRight", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    fireEvent.keyDown(document, { key: "ArrowRight" });
    let open = screen.getByTestId("frame-open");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d2.jpg");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByTestId("frame-open").querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d3.jpg");

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByTestId("frame-open").querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d3.jpg");

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    open = screen.getByTestId("frame-open");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d2.jpg");

    await user.click(screen.getByTestId("share-open"));
    const input = screen.getByLabelText("Share URL");
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(screen.getByTestId("frame-open").querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d2.jpg");
  });

  it("navigates with horizontal touch swipes on the open frame", async () => {
    const user = userEvent.setup();
    vi.mocked(getImages).mockResolvedValue(threeImages());
    render(<App />);
    await user.click(await screen.findByTestId("frame-d1"));

    fireSwipe(screen.getByTestId("frame-open"), 200, 140);
    let open = screen.getByTestId("frame-open");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d2.jpg");

    fireSwipe(screen.getByTestId("frame-open"), 140, 200);
    open = screen.getByTestId("frame-open");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d1.jpg");

    fireSwipe(screen.getByTestId("frame-open"), 200, 140, "mouse");
    expect(screen.getByTestId("frame-open").querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/d1.jpg");
  });

  it("opens the share popup with network links and a copy field", async () => {
    const user = userEvent.setup();
    stubClipboard();
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-2"));
    await user.click(screen.getByTestId("share-open"));

    const popup = await screen.findByTestId("share-popup");
    expect(popup).toHaveTextContent("September 18, 2026 · 12 PM");
    expect(popup.querySelector("img")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );

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

  it("opens the popup on coarse pointers instead of the native share sheet", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    stubPointer(true);
    Object.defineProperty(window.navigator, "share", { value: share, configurable: true });
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-2"));
    await user.click(screen.getByTestId("share-open"));

    expect(await screen.findByTestId("share-popup")).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByTestId("share-other")).toHaveTextContent("Other…");
  });

  it("ignores a native share canceled from the Other button", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockRejectedValue(new DOMException("AbortError"));
    stubPointer(true);
    Object.defineProperty(window.navigator, "share", { value: share, configurable: true });
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-1"));
    await user.click(screen.getByTestId("share-open"));

    expect(await screen.findByTestId("share-popup")).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("share-other"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("share-popup")).toBeInTheDocument();
    expect(screen.getByTestId("frame-open")).toBeInTheDocument();
  });

  it("keeps the popup on fine pointers and shares from the Other button", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    stubPointer(false);
    Object.defineProperty(window.navigator, "share", { value: share, configurable: true });
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-2"));
    await user.click(screen.getByTestId("share-open"));

    expect(await screen.findByTestId("share-popup")).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();

    const other = screen.getByTestId("share-other");
    expect(other).toHaveTextContent("Other…");
    await user.click(other);
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "September 18, 2026 · 12 PM",
        url: `${window.location.origin}/widget/acme/cam-1?date=2026-09-18&hour=12`,
      }),
    );
  });

  it("hides the Other button and opens the popup without navigator.share", async () => {
    const user = userEvent.setup();
    stubPointer(true);
    render(<App />);
    await user.click(await screen.findByTestId("frame-img-1"));
    await user.click(screen.getByTestId("share-open"));

    expect(await screen.findByTestId("share-popup")).toBeInTheDocument();
    expect(screen.queryByTestId("share-other")).not.toBeInTheDocument();
  });

  it("labels captures and share links in the camera timezone", async () => {
    const user = userEvent.setup();
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ timezone: "America/Edmonton" }));
    vi.mocked(getImages).mockResolvedValue([
      makeImage("e1", "2026-10-18T00:12:00Z", "/e1.jpg"),
    ]);
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-10-17&hour=18");
    render(<App />);

    const open = await screen.findByTestId("frame-e1");
    expect(open.querySelector(".frame-osd")).toHaveTextContent("October 17, 2026 · 6 PM");
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
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );
  });

  it("opens the capture from an older ?img deep link", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&img=img-2");
    render(<App />);
    const open = await screen.findByTestId("frame-open");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute(
      "src",
      "/api/v1/cameras/cam-1/2026-09-18/120000.jpg",
    );
  });

  it("gives ?hour precedence over ?img", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&hour=9&img=img-2");
    render(<App />);
    const open = await screen.findByTestId("frame-open");
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute(
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
    await act(async () => {});
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
    expect(open.querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/n1.jpg");
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

    const before = await screen.findByTestId("frame-d1");
    expect(before.querySelector(".frame-osd")).toHaveTextContent("9 AM");

    await act(async () => {
      resolveCamera(makeCamera({ showNight: false }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("frame-d1").querySelector(".frame-osd")).toHaveTextContent("9 AM"),
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
      expect(before.querySelector("img:not(.frame-img-previous)")).toHaveAttribute(
        "src",
        new Date(e1Timestamp).getHours() === 18 ? "/e1.jpg" : "/e2.jpg",
      );
    }

    await act(async () => {
      resolveCamera(makeCamera({ timezone: "America/Edmonton" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("frame-open").querySelector("img:not(.frame-img-previous)")).toHaveAttribute("src", "/e1.jpg"),
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

  it("keeps the current frames during a date change instead of flashing skeletons", async () => {
    const user = userEvent.setup();
    const pending: Array<(images: ImageDto[]) => void> = [];
    vi.mocked(getImages).mockImplementation(
      () =>
        new Promise<ImageDto[]>((resolve) => {
          pending.push(resolve);
        }),
    );
    render(<App />);

    expect(screen.getAllByTestId("film-skeleton")).toHaveLength(8);

    await act(async () => {
      pending[0]!(defaultImages);
    });
    expect(await screen.findByTestId("frame-img-1")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next day"));
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-19"));

    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);
    expect(screen.getByTestId("frame-img-1")).toBeInTheDocument();

    await act(async () => {
      pending[1]!([]);
    });
    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);
  });

  it("keeps the empty state during a date change instead of flashing skeletons", async () => {
    const user = userEvent.setup();
    const pending: Array<(images: ImageDto[]) => void> = [];
    vi.mocked(getImages).mockImplementation(
      () =>
        new Promise<ImageDto[]>((resolve) => {
          pending.push(resolve);
        }),
    );
    render(<App />);

    await act(async () => {
      pending[0]!([]);
    });
    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next day"));
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-19"));

    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);
    expect(screen.getByText("No images for this date.")).toBeInTheDocument();

    await act(async () => {
      pending[1]!([]);
    });
    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
  });

  it("keeps the previous day visible while preloading, then swaps the frames in together", async () => {
    const user = userEvent.setup();
    const pending: Array<(images: ImageDto[]) => void> = [];
    vi.mocked(getImages).mockImplementation(
      () =>
        new Promise<ImageDto[]>((resolve) => {
          pending.push(resolve);
        }),
    );
    render(<App />);

    await act(async () => {
      pending[0]!(defaultImages);
    });
    expect(await screen.findByTestId("frame-img-1")).toBeInTheDocument();

    ImageStub.autoResolve = false;
    ImageStub.instances = [];

    await user.click(screen.getByLabelText("Next day"));
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-1", "2026-09-19"));
    expect(screen.getByTestId("frame-img-1")).toBeInTheDocument();
    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);

    const nextImages = [
      makeImage("next-1", "2026-09-19T09:00:00Z", "/next-1.jpg"),
      makeImage("next-2", "2026-09-19T12:00:00Z", "/next-2.jpg"),
    ];
    await act(async () => {
      pending[1]!(nextImages);
    });

    expect(screen.getByTestId("frame-img-1")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-next-1")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);
    expect(ImageStub.instances.map((image) => image.src)).toEqual(["/next-1.jpg", "/next-2.jpg"]);

    await act(async () => {
      for (const image of ImageStub.instances) image.onload?.();
    });

    expect(await screen.findByTestId("frame-next-1")).toBeInTheDocument();
    expect(screen.getByTestId("frame-next-2")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-img-1")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);
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
    await act(async () => {});
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
    await waitFor(() =>
      expect(screen.getByTestId("film-strip")).toHaveClass("film-strip-scroll"),
    );
    const strip = screen.getByTestId("film-strip");

    await user.click(screen.getByTestId("frame-s0"));
    const open = screen.getByTestId("frame-open");
    expect(open).toHaveClass("frame-open");
    expect(strip).toHaveClass("film-strip-scroll");
    expect(open.closest(".film-strip-scroll")).toBe(strip);
  });

  it("keeps showing the old day while the next date loads, then swaps once", async () => {
    const user = userEvent.setup();
    let resolveNext!: (images: ImageDto[]) => void;
    vi.mocked(getImages).mockImplementationOnce(async () => defaultImages);
    vi.mocked(getImages).mockImplementationOnce(
      () => new Promise<ImageDto[]>((resolve) => (resolveNext = resolve)),
    );
    render(<App />);
    await screen.findByTestId("frame-img-1");

    await user.click(screen.getByLabelText("Next day"));
    expect(screen.getByTestId("frame-img-1")).toBeInTheDocument();
    expect(screen.queryByTestId("film-skeleton")).not.toBeInTheDocument();

    await act(async () => {
      resolveNext([
        makeImage("n1", "2026-09-19T09:00:00Z", "/n1.jpg"),
        makeImage("n2", "2026-09-19T12:00:00Z", "/n2.jpg"),
      ]);
    });
    expect(await screen.findByTestId("frame-n1")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-img-1")).not.toBeInTheDocument();
  });

  it("keeps the loading skeleton outside the transition wrapper without slide-in classes", async () => {
    vi.mocked(getImages).mockImplementation(() => new Promise(() => {}));
    render(<App />);
    const strip = screen.getByTestId("film-strip");
    expect(strip).toHaveClass("film-strip");
    await act(async () => {});
    expect(document.querySelector('[class*="content-enter"]')).toBeNull();
    expect(document.querySelector('[class*="content-exit"]')).toBeNull();
  });

  it("shows a lone capture expanded with share and without a toggle", async () => {
    vi.mocked(getImages).mockResolvedValue([
      makeImage("only", "2026-09-18T09:00:00Z", "/only.jpg"),
    ]);
    const user = userEvent.setup();
    render(<App />);

    const frame = await screen.findByTestId("frame-only");
    expect(frame.querySelector(".frame-osd")).toHaveTextContent("September 18, 2026 · 9 AM");
    expect(frame).not.toHaveAttribute("role", "button");
    expect(frame).not.toHaveAttribute("tabindex");
    expect(screen.queryByTestId("frame-open")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next capture")).not.toBeInTheDocument();
    expect(screen.getByTestId("share-open")).toBeInTheDocument();

    await user.click(frame);
    expect(screen.getByTestId("frame-only")).toBeInTheDocument();
    expect(screen.getByTestId("share-open")).toBeInTheDocument();
  });

  it("warns when the embed helper script is missing and clears it when it appears", async () => {
    render(<App />);
    await screen.findByTestId("frame-img-1");
    expect(screen.queryByText(/Embed script missing/)).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("camera-history:script-missing"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Embed script missing");
    expect(screen.getByRole("status")).toHaveTextContent("embed.js");

    act(() => {
      window.dispatchEvent(new CustomEvent("camera-history:script-ok"));
    });
    expect(screen.queryByText(/Embed script missing/)).not.toBeInTheDocument();
  });

  it("shows the pinned empty copy for a day without images", async () => {
    vi.mocked(getImages).mockResolvedValue([]);
    render(<App />);
    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    expect(screen.queryByTestId("day-only-empty")).not.toBeInTheDocument();
  });

  it("wraps the empty copy in a strip-sized centered box", async () => {
    vi.mocked(getImages).mockResolvedValue([]);
    render(<App />);
    const emptyState = await screen.findByTestId("empty-state");
    expect(emptyState).toHaveClass("empty-state");
    expect(emptyState).toHaveTextContent("No images for this date.");
    expect(emptyState).toHaveTextContent(
      "Use the arrows or the date field to browse other days.",
    );
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
    expect(screen.getByTestId("empty-state")).toContainElement(screen.getByTestId("day-only-empty"));
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
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("forest");
  });

  it("overrides the theme via ?theme", async () => {
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=midnight");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "midnight"));
  });

  it("falls back to the camera theme when ?theme is unknown", async () => {
    vi.mocked(getCamera).mockResolvedValue(makeCamera({ theme: "forest" }));
    window.history.pushState({}, "", "/widget/acme/cam-1?date=2026-09-18&theme=neon");
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("widget")).toHaveAttribute("data-theme", "forest"));
  });
});

const summitGroup = {
  group: { id: "g1", name: "Summit", slug: "summit" },
  cameras: [
    { id: "cam-a", name: "Alpha", theme: "light", timezone: "UTC", retentionMonths: 12, showNight: false },
    { id: "cam-b", name: "Beta", theme: "dark", timezone: "UTC", retentionMonths: 12, showNight: false },
  ],
};

describe("App group widget", () => {
  it("centers the camera switcher alone in the header and keeps the date on switch", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    const switcher = await screen.findByTestId("camera-switcher");
    expect(switcher).toHaveTextContent("Alpha");
    const header = switcher.closest(".widget-header");
    expect(header).not.toBeNull();
    expect(header?.children).toHaveLength(1);
    expect(document.querySelector(".widget-title")).toBeNull();
    expect(screen.queryByText("Summit")).not.toBeInTheDocument();
    expect(await screen.findByTestId("frame-cam-a-2026-10-10")).toBeInTheDocument();

    await user.click(switcher);
    expect(await screen.findAllByRole("option")).toHaveLength(2);
    await user.click(screen.getByTestId("camera-option-cam-b"));
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
        { id: "cam-a", name: "Alpha", theme: "light", timezone: "UTC", retentionMonths: 12, showNight: false },
        {
          id: "cam-b",
          name: "Beta",
          theme: "dark",
          timezone: "America/Edmonton",
          retentionMonths: 12,
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
    expect(alphaFrame.querySelector(".frame-osd")).toHaveTextContent("October 18, 2026 · 12 AM");

    await chooseCamera("cam-b");
    await waitFor(() =>
      expect(screen.getByTestId("frame-e1").querySelector(".frame-osd")).toHaveTextContent(
        "October 17, 2026 · 6 PM",
      ),
    );
    await user.click(screen.getByTestId("share-open"));
    expect(screen.getByTestId("share-popup")).toHaveTextContent("October 17, 2026 · 6 PM");
    const url = new URL((screen.getByLabelText("Share URL") as HTMLInputElement).value);
    expect(url.searchParams.get("hour")).toBe("18");
  });

  it("resyncs night visibility when switching cameras", async () => {
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g1", name: "Summit", slug: "summit" },
      cameras: [
        { id: "cam-a", name: "Alpha", theme: "light", timezone: "UTC", retentionMonths: 12, showNight: true },
        { id: "cam-b", name: "Beta", theme: "dark", timezone: "UTC", retentionMonths: 12, showNight: false },
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

    await chooseCamera("cam-b");
    expect(await screen.findByTestId("frame-cam-b-2026-10-10-d")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-cam-b-2026-10-10-n")).not.toBeInTheDocument();

    await chooseCamera("cam-a");
    expect(await screen.findByTestId("frame-cam-a-2026-10-10-n")).toBeInTheDocument();
  });

  it("falls back to the latest date once when the camera has no images", async () => {
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
    await chooseCamera("cam-b");

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
    await chooseCamera("cam-b");

    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(getCameraLatest)).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("2026-10-09")).toBeInTheDocument();
    expect(vi.mocked(getImages)).toHaveBeenCalledTimes(3);
  });

  it("keeps an explicit no-image date change on the first attempt", async () => {
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getCameraLatest).mockResolvedValue("2026-10-01");
    vi.mocked(getImages).mockImplementation(async (_cameraId, date) =>
      date === "2026-10-10"
        ? [makeImage(`i-${date}`, `${date}T09:00:00Z`, "/i.jpg")]
        : [],
    );

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("frame-i-2026-10-10")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-05" } });

    expect(await screen.findByText("No images for this date.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-10-05")).toBeInTheDocument();
    expect(vi.mocked(getCameraLatest)).not.toHaveBeenCalled();
  });

  it("bounds the group date picker by the selected camera's retention", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-18T05:30:00Z"));
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g1", name: "Summit", slug: "summit" },
      cameras: [
        {
          id: "cam-a",
          name: "Alpha",
          theme: "light",
          timezone: "UTC",
          retentionMonths: 2,
          showNight: false,
        },
        {
          id: "cam-b",
          name: "Beta",
          theme: "dark",
          timezone: "UTC",
          retentionMonths: 12,
          showNight: false,
        },
      ],
    });
    vi.mocked(getImages).mockResolvedValue([makeImage("i1", "2026-08-19T09:00:00Z", "/i1.jpg")]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-08-19");
    render(<App />);

    const input = (await screen.findByLabelText("Date")) as HTMLInputElement;
    const minFor = (months: number) =>
      cameraDate(new Date(Date.now() - months * 30 * 24 * 3600 * 1000), "UTC");
    await waitFor(() => expect(input.min).toBe(minFor(2)));
    expect(input.max).toBe("2026-10-18");
    expect(screen.getByLabelText("Previous day")).toBeDisabled();

    fireEvent.change(input, { target: { value: "2020-01-01" } });
    expect(vi.mocked(getImages)).not.toHaveBeenCalledWith("cam-a", "2020-01-01");
    expect(input).toHaveValue("2026-08-19");

    fireEvent.change(input, { target: { value: "2027-01-01" } });
    expect(vi.mocked(getImages)).not.toHaveBeenCalledWith("cam-a", "2027-01-01");
    expect(input).toHaveValue("2026-08-19");

    await chooseCamera("cam-b");
    await waitFor(() => expect(input.min).toBe(minFor(12)));
    expect(screen.getByLabelText("Previous day")).not.toBeDisabled();
  });

  it("renders without a min or crash when the group camera lacks retentionMonths", async () => {
    vi.mocked(getGroup).mockResolvedValue({
      group: { id: "g1", name: "Summit", slug: "summit" },
      cameras: [
        {
          id: "cam-a",
          name: "Alpha",
          theme: "light",
          timezone: "UTC",
          showNight: false,
        },
      ],
    });
    vi.mocked(getImages).mockResolvedValue([
      makeImage("i1", "2026-10-10T09:00:00Z", "/i1.jpg"),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    expect(await screen.findByTestId("frame-i1")).toBeInTheDocument();
    expect(screen.getByTestId("film-strip")).toBeInTheDocument();
    const input = screen.getByLabelText("Date") as HTMLInputElement;
    expect(input).not.toHaveAttribute("min");
    expect(screen.getByLabelText("Previous day")).not.toBeDisabled();
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

    expect(await screen.findByTestId("frame-cam-a-2026-10-10")).toBeInTheDocument();
    await user.click(screen.getByTestId("share-open"));
    expect(screen.getByTestId("share-popup")).toBeInTheDocument();

    await chooseCamera("cam-b");

    expect(await screen.findByTestId("frame-cam-b-2026-10-10")).toBeInTheDocument();
    expect(screen.queryByTestId("share-popup")).not.toBeInTheDocument();
  });

  it("keeps the old camera on screen until the new camera's first response arrives", async () => {
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    const pending: Array<(images: ImageDto[]) => void> = [];
    vi.mocked(getImages).mockImplementation(
      () =>
        new Promise<ImageDto[]>((resolve) => {
          pending.push(resolve);
        }),
    );

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenCalledTimes(1));
    await act(async () => {
      pending[0]!([makeImage("a1", "2026-10-10T09:00:00Z", "/a1.jpg")]);
    });
    expect(await screen.findByTestId("frame-a1")).toBeInTheDocument();

    await chooseCamera("cam-b");
    await waitFor(() => expect(vi.mocked(getImages)).toHaveBeenLastCalledWith("cam-b", "2026-10-10"));

    expect(screen.queryAllByTestId("film-skeleton")).toHaveLength(0);
    expect(screen.getByTestId("frame-a1")).toBeInTheDocument();

    await act(async () => {
      pending[1]!([makeImage("b1", "2026-10-10T09:00:00Z", "/b1.jpg")]);
    });
    expect(await screen.findByTestId("frame-b1")).toBeInTheDocument();
    expect(screen.queryByTestId("frame-a1")).not.toBeInTheDocument();
  });

  it("includes the selected camera in the share link", async () => {
    const user = userEvent.setup();
    vi.mocked(getGroup).mockResolvedValue(summitGroup);
    vi.mocked(getImages).mockImplementation(async (cameraId, date) => [
      makeImage(`${cameraId}-${date}`, `${date}T09:00:00Z`, `/api/v1/${cameraId}.jpg`),
    ]);

    window.history.pushState({}, "", "/group/t/summit?date=2026-10-10");
    render(<App />);

    await chooseCamera("cam-b");
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

    const switcher = await screen.findByTestId("camera-switcher");
    await waitFor(() => expect(switcher).toHaveTextContent("Beta"));
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

    const switcher = await screen.findByTestId("camera-switcher");
    await waitFor(() => expect(switcher).toHaveTextContent("Alpha"));
    expect(await screen.findByTestId("frame-cam-a-2026-10-10")).toBeInTheDocument();
  });
});
