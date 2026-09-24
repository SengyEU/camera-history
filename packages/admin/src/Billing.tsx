import { useCallback, useEffect, useState } from "react";
import { api, type BillingDto, type BillingStatus } from "./api";

const STATUS_LABELS: Record<BillingStatus, string> = {
  none: "není aktivováno",
  active: "aktivní",
  past_due: "po splatnosti",
  unpaid: "není zaplaceno",
  canceled: "zrušeno",
};

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} kB`;
  return `${n} B`;
}

export function BillingPage() {
  const [data, setData] = useState<BillingDto | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getBilling().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (params.get("paid") === "1") setNotice("Platba proběhla úspěšně.");
    if (params.get("pay") === "cancelled") setNotice("Platba byla zrušena.");
  }, [load]);

  const changePlan = async () => {
    if (selected === null) return;
    setError(null);
    try {
      const res = await api.billingCheckout(selected);
      if (res.url) window.location.assign(res.url);
      else {
        setNotice("Změna tarifu se projeví na příští faktuře.");
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  const openPortal = async () => {
    setError(null);
    try {
      const res = await api.billingPortal();
      window.location.assign(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Načítám…</p>;

  return (
    <section className="panel" data-testid="billing-page">
      <div className="panel-head">
        <h2>Billing</h2>
        <span className={`status status-${data.billingStatus}`}>{STATUS_LABELS[data.billingStatus]}</span>
      </div>
      {!data.billingEnabled && <p className="notice">Platební integrace není aktuálně zapnutá.</p>}
      {notice && (
        <p className="notice" data-testid="billing-notice">
          {notice}
        </p>
      )}
      {data.billingStatus === "past_due" && data.graceUntil && (
        <p className="notice danger">
          Platba po splatnosti — aktivace do {new Date(data.graceUntil).toLocaleString()}.
        </p>
      )}
      {(data.billingStatus === "unpaid" || data.billingStatus === "canceled") && (
        <p className="notice danger">Účet není aktivní. Obnovte platbu pro zapnutí kamer.</p>
      )}
      <p data-testid="current-plan">
        Aktuální tarif: {data.tiers.find((t) => t.current)?.label ?? "—"} · {data.price ?? "—"} € / kamera
      </p>
      <div className="plan-grid">
        {data.tiers.map((tier) => (
          <label key={tier.months} className="plan-card">
            <input
              type="radio"
              name="plan"
              data-testid={`plan-${tier.months}`}
              checked={selected === tier.months}
              onChange={() => setSelected(tier.months)}
            />
            <strong>{tier.label}</strong>
            <span>{tier.eurPerCamera} € / kamera / měsíc</span>
            {tier.current && <em>aktuální</em>}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button onClick={changePlan} data-testid="change-plan">
          Změnit tarif
        </button>
        <button className="secondary" onClick={openPortal} data-testid="open-portal">
          Platby / faktury
        </button>
      </div>
      <dl className="usage-stats">
        <div>
          <dt>Kamery</dt>
          <dd data-testid="camera-count">{data.cameraCount}</dd>
        </div>
        <div>
          <dt>Uloženo</dt>
          <dd data-testid="usage-bytes">{formatBytes(data.usageBytes)}</dd>
        </div>
        <div>
          <dt>Odhad plné retence</dt>
          <dd data-testid="storage-bytes">{formatBytes(data.storageBytes)}</dd>
        </div>
      </dl>
    </section>
  );
}