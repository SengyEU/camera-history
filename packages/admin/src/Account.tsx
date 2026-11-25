import { useRef, useState, type FormEvent, type RefObject } from "react";
import { api, ApiError } from "./api";
import { PageHeader } from "./PageHeader";

type PasswordErrors = {
  current?: string;
  next?: string;
  confirm?: string;
};

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  testId,
  error,
  errorTestId,
  fieldName,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  testId: string;
  error?: string;
  errorTestId?: string;
  fieldName: string;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <label className="account-field" htmlFor={id}>
      {label}
      <span className="password-field">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-account-field={fieldName}
          data-testid={testId}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          data-testid={`${testId}-toggle`}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {error && (
        <span className="field-error" id={errorId} data-testid={errorTestId}>
          {error}
        </span>
      )}
    </label>
  );
}

function passwordProblem(password: string): string | null {
  if (password.length < 8 || password.length > 128) {
    return "Use 8 to 128 characters.";
  }
  if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Include one uppercase letter and one number.";
  }
  return null;
}

function changeError(err: unknown): { field?: keyof PasswordErrors; message: string } {
  if (!(err instanceof ApiError)) {
    return { message: "We can’t reach the server. Check your connection and try again." };
  }
  const detail = err.message.toLowerCase();
  if (err.status === 401) {
    return { message: "Your session expired. Sign in again." };
  }
  if (err.status === 429) {
    return { message: "Too many attempts. Wait a minute and try again." };
  }
  if (err.status === 400) {
    if (detail.includes("current password")) {
      return { field: "current", message: "Current password is incorrect." };
    }
    if (detail.includes("different")) {
      return { field: "next", message: "Choose a password you haven’t used here." };
    }
    if (detail.includes("password")) {
      return { field: "next", message: "Use 8 to 128 characters, one uppercase letter and one number." };
    }
    return { message: err.message };
  }
  if (err.status >= 500) {
    return { message: "Something went wrong. Try again in a moment." };
  }
  return { message: err.message || "Something went wrong." };
}

export function AccountPage({ tenantName, email }: { tenantName: string; email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const focusFirst = (next: PasswordErrors) => {
    window.setTimeout(() => {
      const field = next.current ? "current" : next.next ? "next" : "confirm";
      document.querySelector<HTMLInputElement>(`[data-account-field="${field}"]`)?.focus();
    }, 0);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const next: PasswordErrors = {};
    if (!currentPassword) next.current = "Enter your current password.";
    const problem = passwordProblem(newPassword);
    if (!newPassword) next.next = "Create a new password.";
    else if (problem) next.next = problem;
    if (!confirm) next.confirm = "Repeat your new password.";
    else if (confirm !== newPassword) next.confirm = "Passwords don’t match.";
    setErrors(next);
    setFormError(null);
    setNotice(null);
    if (next.current || next.next || next.confirm) {
      focusFirst(next);
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setNotice("Password updated.");
    } catch (err) {
      const mapped = changeError(err);
      if (mapped.field) {
        setErrors((current) => ({ ...current, [mapped.field!]: mapped.message }));
        focusFirst({ [mapped.field]: mapped.message });
      } else {
        setFormError(mapped.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Account" description="Manage your sign-in details." />
      <section className="panel account-page" data-testid="account-page">
        <div className="account-identity">
          <div className="account-identity-item">
            <span>Workspace</span>
            <strong data-testid="account-tenant">{tenantName || "—"}</strong>
            <p>Workspace name can only be changed by support.</p>
          </div>
          <div className="account-identity-item">
            <span>Email</span>
            <strong data-testid="account-email">{email}</strong>
            <p>Sign-in email can only be changed by support.</p>
          </div>
        </div>
        <p className="field-hint account-support">
          Need to change your workspace name or email?{" "}
          <a href="mailto:hello@sengycraft.cz">Contact support</a>.
        </p>

        <div className="account-password">
          <div className="panel-head">
            <h2>Password</h2>
          </div>
          <p className="account-section-copy">
            Use 8 to 128 characters with one uppercase letter and one number.
          </p>
          <form className="account-form" noValidate onSubmit={submit}>
            <PasswordInput
              id="account-current-password"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              testId="account-current-password"
              error={errors.current}
              errorTestId="account-current-password-error"
              fieldName="current"
              inputRef={currentRef}
            />
            <PasswordInput
              id="account-new-password"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              testId="account-new-password"
              error={errors.next}
              errorTestId="account-new-password-error"
              fieldName="next"
              inputRef={nextRef}
            />
            <PasswordInput
              id="account-confirm-password"
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              testId="account-confirm-password"
              error={errors.confirm}
              errorTestId="account-confirm-password-error"
              fieldName="confirm"
              inputRef={confirmRef}
            />
            {formError && (
              <p className="notice danger" data-testid="account-password-error" role="alert">
                {formError}
              </p>
            )}
            {notice && (
              <p className="notice" data-testid="account-password-notice" role="status">
                {notice}
              </p>
            )}
            <div className="account-actions">
              <button type="submit" disabled={saving} data-testid="account-password-submit">
                {saving ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
