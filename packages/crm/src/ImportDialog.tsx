import { useState } from "react";
import { api } from "./api";

interface Props {
  onClose: () => void;
  onImported: () => Promise<void>;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export function ImportDialog({ onClose, onImported }: Props) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    try {
      setCsv(await file.text());
    } catch {
      setError("Could not read the file");
    }
  };

  const run = async () => {
    if (!csv.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const imported = await api.importCsv(csv);
      setResult(imported);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">CSV</span>
            <h2>Import leads</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close import">
            ×
          </button>
        </header>

        <p className="subtle">
          Use the same columns as <code>pilots/leads.csv</code>. Existing slugs are updated with
          source data; status, notes and contact dates are kept.
        </p>

        <label className="file-drop">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          <span>{fileName || "Choose a CSV file"}</span>
          <small>or paste CSV below</small>
        </label>

        <textarea
          rows={8}
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          placeholder="slug,company,website,…"
          aria-label="CSV content"
        />

        {error && <p className="error">{error}</p>}
        {result && (
          <div className="import-result">
            <strong>
              {result.created} created · {result.updated} updated · {result.skipped} skipped
            </strong>
            {result.errors.length > 0 && (
              <ul>
                {result.errors.map((item) => (
                  <li key={`${item.row}-${item.message}`}>
                    Row {item.row}: {item.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={() => void run()} disabled={busy || !csv.trim()}>
            {busy ? "Importing…" : "Import CSV"}
          </button>
        </div>
      </section>
    </div>
  );
}
