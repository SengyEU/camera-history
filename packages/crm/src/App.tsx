import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { ImportDialog } from "./ImportDialog";
import { LeadDetail } from "./LeadDetail";
import { LeadsPage } from "./LeadsPage";
import { LEAD_STATUSES, type Lead, type LeadStatus, type LeadSummary } from "./types";

type Session = "checking" | "out" | "in" | "denied";
type View = "leads" | "pipeline" | "followups";

const EMPTY_SUMMARY: LeadSummary = {
  total: 0,
  dueFollowUps: 0,
  withEmail: 0,
  byStatus: Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0])) as Record<
    LeadStatus,
    number
  >,
};

function Login({ onSuccess, onDenied }: { onSuccess: (email: string) => void; onDenied: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(email.trim(), password);
      try {
        const me = await api.me();
        onSuccess(me.email);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          onDenied();
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <div className="login-brand">
          <span className="brand-mark">CH</span>
          <div>
            <strong>Camera History</strong>
            <small>Internal CRM</small>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="subtle">Internal outreach and pilot tracking. Customer accounts have no access.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="login-foot">Camera History · internal use only</p>
      </form>
    </main>
  );
}

function Denied({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">CH</span>
          <div>
            <strong>Camera History</strong>
            <small>Internal CRM</small>
          </div>
        </div>
        <h1>No access</h1>
        <p className="subtle">
          This account is not on the CRM allowlist. Use the internal account or ask Marek to add
          your email.
        </p>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<Session>("checking");
  const [email, setEmail] = useState("");
  const [view, setView] = useState<View>("leads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<LeadSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listLeads();
      setLeads(data.leads);
      setSummary(data.summary);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setSession("out");
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setSession("denied");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((me) => {
        if (!active) return;
        setEmail(me.email);
        setSession("in");
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setSession("denied");
        else setSession("out");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session === "in") void loadLeads();
  }, [session, loadLeads]);

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setSession("out");
    setEmail("");
    setLeads([]);
    setSummary(EMPTY_SUMMARY);
    setSelected(null);
  };

  const updateLead = async (id: string, patch: Parameters<typeof api.updateLead>[1]) => {
    await api.updateLead(id, patch);
    await loadLeads();
  };

  if (session === "checking") {
    return (
      <main className="login-page">
        <p className="loading">Checking session…</p>
      </main>
    );
  }

  if (session === "denied") {
    return <Denied onSignOut={() => void signOut()} />;
  }

  if (session === "out") {
    return (
      <Login
        onSuccess={(nextEmail) => {
          setEmail(nextEmail);
          setSession("in");
        }}
        onDenied={() => setSession("denied")}
      />
    );
  }

  return (
    <main className="crm">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CH</span>
          <div>
            <strong>Camera History</strong>
            <small>CRM</small>
          </div>
        </div>
        <nav className="topbar-nav">
          <button
            type="button"
            className={view === "leads" ? "nav-item active" : "nav-item"}
            onClick={() => setView("leads")}
          >
            Leads
          </button>
          <button
            type="button"
            className={view === "pipeline" ? "nav-item active" : "nav-item"}
            onClick={() => setView("pipeline")}
          >
            Pipeline
          </button>
          <button
            type="button"
            className={view === "followups" ? "nav-item active" : "nav-item"}
            onClick={() => setView("followups")}
          >
            Follow-ups
            {summary.dueFollowUps > 0 && <span className="nav-badge">{summary.dueFollowUps}</span>}
          </button>
        </nav>
        <div className="topbar-actions">
          <button type="button" className="secondary small" onClick={() => setImportOpen(true)}>
            Import CSV
          </button>
          <a className="button-link small" href={api.exportUrl}>
            Export CSV
          </a>
          <span className="user" title={email}>
            {email}
          </span>
          <button type="button" className="secondary small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice">
          {notice}
          <button type="button" className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <LeadsPage
        leads={leads}
        summary={summary}
        view={view}
        loading={loading}
        error={error}
        onSelect={setSelected}
        onUpdate={updateLead}
      />

      {selected && (
        <LeadDetail
          leadId={selected}
          onClose={() => setSelected(null)}
          onChanged={loadLeads}
        />
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            await loadLeads();
            setNotice("CSV imported. Existing manual state was kept.");
          }}
        />
      )}
    </main>
  );
}
