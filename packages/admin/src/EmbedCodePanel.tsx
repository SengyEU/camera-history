import { useState } from "react";

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

  const copy = () => {
    const clip = navigator.clipboard;
    if (!clip?.writeText) return;
    void clip
      .writeText(code)
      .then(() => setCopied(true))
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
        <button type="button" className="secondary" onClick={copy} data-testid={`${testId}-copy`}>
          Copy embed code
        </button>
        {copied && <span data-testid={`${testId}-copied`}>Copied</span>}
      </div>
      <p className="field-hint" data-testid={`${testId}-hint`}>
        {hint} <code>#{id}</code>{suffix ? ` ${suffix}` : ""}
      </p>
    </div>
  );
}
