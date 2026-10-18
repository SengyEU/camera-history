import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ImageDto } from "./api";

export function viewerHourParts(timestamp: string): { hour: number; meridiem: "AM" | "PM" } {
  const hours = new Date(timestamp).getHours();
  return {
    hour: hours % 12 === 0 ? 12 : hours % 12,
    meridiem: hours < 12 ? "AM" : "PM",
  };
}

export function viewerHourLabel(timestamp: string): string {
  const { hour, meridiem } = viewerHourParts(timestamp);
  return `${hour} ${meridiem}`;
}

export function viewerCaptureLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

interface FilmStripProps {
  images: ImageDto[];
  loading: boolean;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onShare: (image: ImageDto) => void;
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </svg>
  );
}

type NavDirection = "fade" | "next" | "prev";

export function FilmStrip({ images, loading, openId, onOpenChange, onShare }: FilmStripProps) {
  const openIndex = openId ? images.findIndex((image) => image.id === openId) : -1;
  const openImage = openIndex >= 0 ? images[openIndex] : undefined;
  const openRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [prevOpenIndex, setPrevOpenIndex] = useState(openIndex);
  const [nav, setNav] = useState<NavDirection>("fade");

  if (openIndex !== prevOpenIndex) {
    setPrevOpenIndex(openIndex);
    setNav(openIndex >= 0 && prevOpenIndex >= 0 ? (openIndex > prevOpenIndex ? "next" : "prev") : "fade");
  }

  const userOpen = (id: string | null) => {
    setPlaying(false);
    onOpenChange(id);
  };

  useEffect(() => {
    if (!openId) return;
    openRef.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [openId]);

  useEffect(() => {
    setPlaying(false);
  }, [images]);

  useEffect(() => {
    if (!openId) setPlaying(false);
  }, [openId]);

  useEffect(() => {
    if (playing && openIndex >= 0 && openIndex >= images.length - 1) setPlaying(false);
  }, [playing, openIndex, images.length]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (openIndex < 0 || openIndex >= images.length - 1) {
        setPlaying(false);
        return;
      }
      onOpenChange(images[openIndex + 1]!.id);
    }, 700);
    return () => window.clearInterval(timer);
  }, [playing, openIndex, images, onOpenChange]);

  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (openIndex < 0) return;
      const nextIndex = openIndex + (event.key === "ArrowRight" ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= images.length) return;
      event.preventDefault();
      userOpen(images[nextIndex]!.id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, openIndex, images]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    suppressClickRef.current = false;
    if (event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    swipeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerCancel = () => {
    swipeRef.current = null;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.pointerId !== event.pointerId || event.pointerType !== "touch") return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    suppressClickRef.current = true;
    const nextIndex = openIndex + (dx < 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= images.length) return;
    userOpen(images[nextIndex]!.id);
  };

  return (
    <div
      className={`film-strip${images.length > 28 ? " film-strip-scroll" : ""}`}
      data-testid="film-strip"
      aria-busy={loading || undefined}
    >
      {loading &&
        Array.from({ length: 8 }, (_, index) => (
          <div
            key={`skeleton-${index}`}
            className="film-skeleton"
            data-testid="film-skeleton"
            aria-hidden="true"
          />
        ))}
      {!loading &&
        images.map((image, index) => {
          if (openImage && image.id === openImage.id) {
            const label = viewerCaptureLabel(image.timestamp);
            return (
              <div
                key={image.id}
                ref={openRef}
                className="frame frame-open"
                data-testid="frame-open"
                data-nav={nav}
                role="button"
                tabIndex={0}
                aria-label="Collapse capture"
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  userOpen(null);
                }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    userOpen(null);
                  }
                }}
              >
                <img className="frame-img" src={image.url} alt={label} />
                <span className="frame-osd">{label}</span>
                {index > 0 && (
                  <button
                    type="button"
                    className="frame-arrow frame-arrow-left"
                    aria-label="Previous capture"
                    onClick={(event) => {
                      event.stopPropagation();
                      userOpen(images[index - 1]!.id);
                    }}
                  >
                    ‹
                  </button>
                )}
                {index < images.length - 1 && (
                  <button
                    type="button"
                    className="frame-arrow frame-arrow-right"
                    aria-label="Next capture"
                    onClick={(event) => {
                      event.stopPropagation();
                      userOpen(images[index + 1]!.id);
                    }}
                  >
                    ›
                  </button>
                )}
                <button
                  type="button"
                  className="frame-play"
                  data-testid="play-toggle"
                  aria-label={playing ? "Pause time-lapse" : "Play time-lapse"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPlaying((value) => !value);
                  }}
                >
                  {playing ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <button
                  type="button"
                  className="frame-share"
                  data-testid="share-open"
                  aria-label="Share this capture"
                  onClick={(event) => {
                    event.stopPropagation();
                    setPlaying(false);
                    onShare(image);
                  }}
                >
                  <ShareGlyph />
                </button>
              </div>
            );
          }

          const hour = viewerHourParts(image.timestamp);
          return (
            <button
              key={image.id}
              type="button"
              className="frame"
              data-testid={`frame-${image.id}`}
              aria-label={`Open capture ${hour.hour} ${hour.meridiem}`}
              style={{ backgroundImage: `url(${image.url})` }}
              onClick={() => userOpen(image.id)}
            >
              <span className="frame-hours">
                <span className="chip-h">{hour.hour}</span>{" "}
                <span className="chip-ap">{hour.meridiem}</span>
              </span>
            </button>
          );
        })}
    </div>
  );
}
