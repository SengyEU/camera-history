import { useEffect, useRef } from "react";
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
  const date = new Date(timestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${date} · ${viewerHourLabel(timestamp)}`;
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

export function FilmStrip({ images, loading, openId, onOpenChange, onShare }: FilmStripProps) {
  const openIndex = openId ? images.findIndex((image) => image.id === openId) : -1;
  const openImage = openIndex >= 0 ? images[openIndex] : undefined;
  const openRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openId) return;
    openRef.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [openId]);

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
                role="button"
                tabIndex={0}
                aria-label="Collapse capture"
                onClick={() => onOpenChange(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenChange(null);
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
                      onOpenChange(images[index - 1]!.id);
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
                      onOpenChange(images[index + 1]!.id);
                    }}
                  >
                    ›
                  </button>
                )}
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
              onClick={() => onOpenChange(image.id)}
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
