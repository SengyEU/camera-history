import { useEffect, useRef, useState } from "react";

export function EmbedCodePanel({
  code,
  id,
  hint,
  suffix = "",
  testId = "camera-embed",
}: {
  code: string;
  id: string;
  hint: string;
  suffix?: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = () => {
    const clip = navigator.clipboard;
    if (!clip?.writeText) return;
    void clip
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="camera-embed" data-testid={testId}>
      <div className="panel-head">
        <h3>Embed code</h3>
        <span className="ts-chip">EMBED</span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
      <div className="group-embed-actions">
        <button
          type="button"
          className={copied ? "secondary is-copied" : "secondary"}
          aria-live="polite"
          onClick={copy}
          data-testid={`${testId}-copy`}
        >
          {copied ? "Copied" : "Copy embed code"}
        </button>
      </div>
      <p className="field-hint" data-testid={`${testId}-hint`}>
        {hint} <code>#{id}</code>{suffix ? ` ${suffix}` : ""}
      </p>
    </div>
  );
}
