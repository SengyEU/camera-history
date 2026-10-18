import { useCallback, useEffect, useRef, useState } from "react";

interface SharePopupProps {
  title: string;
  url: string;
  onClose: () => void;
}

const NETWORKS = [
  {
    name: "Facebook",
    label: "Share on Facebook",
    href: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    name: "X",
    label: "Share on X",
    href: (url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(url)}`,
  },
  {
    name: "WhatsApp",
    label: "Share on WhatsApp",
    href: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}`,
  },
  {
    name: "Telegram",
    label: "Share on Telegram",
    href: (url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}`,
  },
];

export function SharePopup({ title, url, onClose }: SharePopupProps) {
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), 160);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const handleCopy = () => {
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div
        className={`share-overlay${closing ? " share-overlay-closing" : ""}`}
        data-testid="share-overlay"
        onClick={requestClose}
      />
      <div
        className={`share-popup${closing ? " share-popup-closing" : ""}`}
        data-testid="share-popup"
        role="dialog"
        aria-label={`Share ${title}`}
      >
        <header>
          <span className="share-title">{title}</span>
          <button
            type="button"
            className="share-close"
            data-testid="share-close"
            aria-label="Close share popup"
            onClick={requestClose}
          >
            ×
          </button>
        </header>
        <div className="share-content">
          <p>Share link to this image via</p>
          <div className="share-networks">
            {NETWORKS.map((network) => (
              <a
                key={network.name}
                className="share-network"
                aria-label={network.label}
                href={network.href(url)}
                target="_blank"
                rel="noopener"
              >
                {network.name}
              </a>
            ))}
          </div>
          <p>Or copy link</p>
          <div className="share-copy">
            <input
              type="text"
              readOnly
              value={url}
              aria-label="Share URL"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
