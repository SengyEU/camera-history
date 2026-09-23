import { useEffect, useState } from "react";
import { api } from "./api";
import "./App.css";

function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.login(email, password);
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <form className="login" onSubmit={submit} data-testid="login-form">
      <h1>Camera History Admin</h1>
      {error && <p className="error" data-testid="login-error">{error}</p>}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid="login-email"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid="login-password"
      />
      <button type="submit" data-testid="login-submit">
        Přihlásit se
      </button>
    </form>
  );
}

export function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api
      .listCameras()
      .then(() => setEmail(""))
      .catch(() => setEmail(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return <p className="loading">Načítám…</p>;

  return (
    <main className="admin" data-testid="admin-app">
      {email === null ? (
        <Login onSuccess={setEmail} />
      ) : (
        <p className="placeholder" data-testid="dashboard-placeholder">
          Dashboard pro {email} — tento náhradní obsah nahradí Task 8.
        </p>
      )}
    </main>
  );
}