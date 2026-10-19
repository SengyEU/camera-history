import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ImageDto } from "./api";
import { formatCameraCaptureLabel, localHourParts } from "./time";

export function viewerHourParts(
  timestamp: string,
  timezone: string,
): { hour: number; meridiem: "AM" | "PM" } {
  return localHourParts(timestamp, timezone);
}

export function viewerCaptureLabel(timestamp: string, timezone: string): string {
  return formatCameraCaptureLabel(timestamp, timezone);
}

interface FilmStripProps {
  images: ImageDto[];
  loading: boolean;
  timezone: string;
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

export function FilmStrip({
  images,
  loading,
  timezone,
  openId,
  onOpenChange,
  onShare,
}: FilmStripProps) {
  const openIndex = openId ? images.findIndex((image) => image.id === openId) : -1;
  const openImage = openIndex >= 0 ? images[openIndex] : undefined;
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [sliceWidth, setSliceWidth] = useState(0);
  const openRef = useRef<HTMLDivElement | null>(null);
  const lastOpenRef = useRef<ImageDto | null>(null);
  const [frozenId, setFrozenId] = useState<string | null>(null);
  const [motion, setMotion] = useState<"idle" | "step" | "close">("idle");
  const [quietOpenId, setQuietOpenId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const previous = lastOpenRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (previous && openId === null) {
      lastOpenRef.current = null;
      setFrozenId(previous.id);
      setMotion("close");
      setQuietOpenId(null);
      timer = setTimeout(() => {
        setFrozenId(null);
        setMotion("idle");
      }, 540);
    } else if (openImage && previous && previous.id !== openImage.id) {
      lastOpenRef.current = openImage;
      setFrozenId(previous.id);
      setMotion("step");
      setQuietOpenId(openImage.id);
      timer = setTimeout(() => {
        setFrozenId(null);
        setMotion("idle");
      }, 540);
    } else {
      lastOpenRef.current = openImage ?? null;
      if (openId !== null) {
        setFrozenId(null);
        setMotion("idle");
        if (!previous) setQuietOpenId(null);
      }
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [openId, openImage]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => {
      const count = Math.max(images.length, 1);
      const width = strip.clientWidth;
      setSliceWidth(width > 0 ? (width - (count - 1) * 2) / count : 0);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(strip);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [images.length]);
  const swipeRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!openId) return;
    openRef.current?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (openIndex < 0) return;
      const nextIndex = openIndex + (event.key === "ArrowRight" ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= images.length) return;
      event.preventDefault();
      onOpenChange(images[nextIndex]!.id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId, openIndex, images, onOpenChange]);

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
    onOpenChange(images[nextIndex]!.id);
  };

  return (
    <div
      ref={stripRef}
      className={`film-strip${images.length > 28 ? " film-strip-scroll" : ""}${
        motion !== "idle" ? ` film-strip-${motion}` : ""
      }`}
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
          const isOpen = openImage !== undefined && image.id === openImage.id;
          const isClosing = frozenId === image.id && !isOpen;
          const hour = viewerHourParts(image.timestamp, timezone);
          const label = isOpen ? viewerCaptureLabel(image.timestamp, timezone) : "";
          const sliceStep = images.length > 28 ? 14 : sliceWidth;
          return (
            <div
              key={image.id}
              ref={isOpen ? openRef : undefined}
              className={`frame${isOpen ? " frame-open" : ""}${isClosing ? " frame-closing" : ""}${isOpen && quietOpenId === image.id ? " frame-quiet" : ""}`}
              data-testid={isOpen ? "frame-open" : `frame-${image.id}`}
              role="button"
              tabIndex={0}
              aria-label={isOpen ? "Collapse capture" : `Open capture ${hour.hour} ${hour.meridiem}`}
              onMouseDown={(event) => event.preventDefault()}
              style={
                isOpen
                  ? undefined
                  : {
                      backgroundImage: `url(${image.url})`,
                      backgroundPosition: `${Math.round(-index * sliceStep)}px center`,
                    }
              }
              onClick={() => {
                if (!isOpen) {
                  onOpenChange(image.id);
                  return;
                }
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onOpenChange(null);
              }}
              onPointerDown={isOpen ? handlePointerDown : undefined}
              onPointerUp={isOpen ? handlePointerUp : undefined}
              onPointerCancel={isOpen ? handlePointerCancel : undefined}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onOpenChange(isOpen ? null : image.id);
              }}
            >
              {isOpen || isClosing ? (
                <>
                  <img className="frame-img" src={image.url} alt={isOpen ? label : ""} />
                  {isOpen && <span className="frame-osd">{label}</span>}
                  {isClosing && (
                    <span className="frame-hours">
                      <span className="chip-h">{hour.hour}</span>{" "}
                      <span className="chip-ap">{hour.meridiem}</span>
                    </span>
                  )}
                  {isOpen && index > 0 && (
                    <button
                      type="button"
                      className="frame-arrow frame-arrow-left"
                      aria-label="Previous capture"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenChange(images[index - 1]!.id);
                      }}
                    >
                      ‹
                    </button>
                  )}
                  {isOpen && index < images.length - 1 && (
                    <button
                      type="button"
                      className="frame-arrow frame-arrow-right"
                      aria-label="Next capture"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenChange(images[index + 1]!.id);
                      }}
                    >
                      ›
                    </button>
                  )}
                  {isOpen && (
                    <button
                      type="button"
                      className="frame-share"
                      data-testid="share-open"
                      aria-label="Share this capture"
                      onClick={(event) => {
                        event.stopPropagation();
                        onShare(image);
                      }}
                    >
                      <ShareGlyph />
                    </button>
                  )}
                </>
              ) : (
                <span className="frame-hours">
                  <span className="chip-h">{hour.hour}</span>{" "}
                  <span className="chip-ap">{hour.meridiem}</span>
                </span>
              )}
            </div>
          );
        })}
    </div>
  );
}
