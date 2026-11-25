import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { api, ApiError } from "./api";
import { SLUG_RE, slugify } from "./slug";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NETWORK_ERROR = "We can’t reach the server. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

type FieldErrors = {
  name?: string;
  slug?: string;
  email?: string;
  password?: string;
  confirm?: string;
};

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="admin auth-screen">
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-top">
              <span className="auth-brand-name">Camera History</span>
              <span className="ts-chip">ADMIN</span>
            </div>
            {children}
          </div>
          <p className="auth-support">
            Need help? <a href="mailto:hello@sengycraft.cz">hello@sengycraft.cz</a>
          </p>
        </section>
      </div>
    </main>
  );
}

export function AuthSplash() {
  return (
    <main className="admin auth-screen auth-screen-splash">
      <div className="auth-splash" role="status" aria-live="polite">
        <span className="auth-brand-name">Camera History</span>
        <span className="auth-splash-line" aria-hidden="true" />
        <p>Loading your workspace…</p>
      </div>
    </main>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  testId,
  toggleTestId,
  autoComplete,
  error,
  errorTestId,
  inputRef,
  fieldName,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  toggleTestId: string;
  autoComplete?: string;
  error?: string;
  errorTestId?: string;
  inputRef?: RefObject<HTMLInputElement>;
  fieldName?: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <label className="field" htmlFor={id}>
      {label}
      <span className="password-field">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-auth-field={fieldName}
          data-testid={testId}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          data-testid={toggleTestId}
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

function firstInvalidField(errors: FieldErrors): string | null {
  for (const key of ["name", "slug", "email", "password", "confirm"] as const) {
    if (errors[key]) return key;
  }
  return null;
}

function focusField(field: string | null) {
  if (!field) return;
  window.setTimeout(() => {
    const element = document.querySelector<HTMLInputElement>(`[data-auth-field="${field}"]`);
    element?.focus();
  }, 0);
}

function loginError(err: unknown): string {
  if (!(err instanceof ApiError)) return NETWORK_ERROR;
  if (err.status === 401) return "Email or password is incorrect.";
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (err.status >= 500) return "Sign in is temporarily unavailable. Try again in a moment.";
  return err.message || GENERIC_ERROR;
}

function registerError(err: unknown): { field?: keyof FieldErrors; message: string } {
  if (!(err instanceof ApiError)) return { message: NETWORK_ERROR };
  const detail = err.message.toLowerCase();
  if (err.status === 409) {
    if (detail.includes("email")) {
      return { field: "email", message: "An account with this email already exists. Sign in instead." };
    }
    if (detail.includes("slug")) {
      return { field: "slug", message: "This workspace URL is already taken." };
    }
    return { message: err.message };
  }
  if (err.status === 403 && detail.includes("pilot")) {
    return { message: "This pilot invite code is not valid." };
  }
  if (err.status === 429) {
    return { message: "Too many attempts. Wait a minute and try again." };
  }
  if (err.status === 400) {
    if (detail.includes("email")) return { field: "email", message: "Enter a valid email address." };
    if (detail.includes("slug")) return { field: "slug", message: "This workspace URL isn’t valid." };
    if (detail.includes("password")) {
      return { field: "password", message: "Use a password with 8 to 128 characters." };
    }
    if (detail.includes("name")) return { field: "name", message: "Enter a company name up to 80 characters." };
    return { message: err.message };
  }
  if (err.status >= 500) return { message: GENERIC_ERROR };
  return { message: err.message || GENERIC_ERROR };
}

export function Login({
  onSuccess,
  onRegister,
  notice,
}: {
  onSuccess: (email: string) => void;
  onRegister: () => void;
  notice?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const next: FieldErrors = {};
    const trimmed = email.trim();
    if (!trimmed) next.email = "Enter your email address.";
    else if (!EMAIL_RE.test(trimmed)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError(null);
    if (firstInvalidField(next)) {
      focusField(firstInvalidField(next));
      return;
    }
    setSubmitting(true);
    try {
      await api.login(trimmed, password);
      onSuccess(trimmed);
    } catch (err) {
      setFormError(loginError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-head">
        <span className="ts-chip">SIGN IN</span>
        <h1>Welcome back</h1>
        <p>Sign in to manage your cameras, groups and embeds.</p>
      </div>
      {notice && (
        <p className="auth-alert" data-testid="auth-notice" role="status">
          {notice}
        </p>
      )}
      <form className="auth-form" noValidate onSubmit={submit} data-testid="login-form">
        <label className="field" htmlFor="login-email">
          Email
          <input
            ref={emailRef}
            id="login-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            data-auth-field="email"
            data-testid="login-email"
          />
          {errors.email && (
            <span className="field-error" id="login-email-error" data-testid="login-email-error">
              {errors.email}
            </span>
          )}
        </label>
        <PasswordField
          id="login-password"
          label="Password"
          placeholder="Your password"
          value={password}
          onChange={setPassword}
          testId="login-password"
          toggleTestId="login-password-toggle"
          autoComplete="current-password"
          error={errors.password}
          errorTestId="login-password-error"
          inputRef={passwordRef}
          fieldName="password"
        />
        {formError && (
          <p className="auth-alert" data-testid="login-error" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="auth-submit" disabled={submitting} data-testid="login-submit">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-switch">
        New to Camera History?{" "}
        <button type="button" className="link" onClick={onRegister} data-testid="goto-register">
          Create an account
        </button>
      </p>
    </AuthShell>
  );
}

export function Register({
  onSuccess,
  onSignIn,
}: {
  onSuccess: (email: string) => void;
  onSignIn: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const pilotCode = params.get("pilot") ?? undefined;
  const packageCode = params.get("package") ?? undefined;

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    const refs: Record<string, RefObject<HTMLInputElement>> = {
      name: nameRef,
      slug: slugRef,
      email: emailRef,
      password: passwordRef,
      confirm: confirmRef,
    };
    const first = firstInvalidField(errors);
    if (first) refs[first]?.current?.focus();
  }, [errors]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const next: FieldErrors = {};
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) next.name = "Enter your company name.";
    else if (trimmedName.length > 80) next.name = "Use 80 characters or fewer.";
    if (!trimmedSlug) next.slug = "Enter a workspace URL.";
    else if (trimmedSlug.length > 40) next.slug = "Use 40 characters or fewer.";
    else if (!SLUG_RE.test(trimmedSlug)) next.slug = "Use lowercase letters, numbers and dashes.";
    if (!trimmedEmail) next.email = "Enter your email address.";
    else if (!EMAIL_RE.test(trimmedEmail)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Create a password.";
    else if (password.length < 8 || password.length > 128) {
      next.password = "Use 8 to 128 characters.";
    }
    if (!confirm) next.confirm = "Repeat your password.";
    else if (confirm !== password) next.confirm = "Passwords don’t match.";
    setErrors(next);
    setFormError(null);
    if (firstInvalidField(next)) return;
    setSubmitting(true);
    try {
      await api.register({
        name: trimmedName,
        slug: trimmedSlug,
        email: trimmedEmail,
        password,
        pilotCode,
        packageCode,
      });
      window.location.hash = "";
      onSuccess(trimmedEmail);
    } catch (err) {
      const mapped = registerError(err);
      if (mapped.field) {
        setErrors((current) => ({ ...current, [mapped.field!]: mapped.message }));
      } else {
        setFormError(mapped.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-head">
        <span className="ts-chip">NEW WORKSPACE</span>
        <h1>Create your account</h1>
        <p>Set up your workspace, then add your first camera.</p>
      </div>
      {pilotCode && (
        <p className="auth-note" data-testid="pilot-note">
          Pilot access — free for 90 days.
        </p>
      )}
      {packageCode && (
        <p className="auth-note" data-testid="package-note">
          Selected package: {packageCode.charAt(0).toUpperCase() + packageCode.slice(1)}.
        </p>
      )}
      <form className="auth-form" noValidate onSubmit={submit} data-testid="register-form">
        <fieldset className="auth-section">
          <legend>Workspace</legend>
          <label className="field" htmlFor="register-name">
            Company name
            <input
              ref={nameRef}
              id="register-name"
              placeholder="Alpine Resort"
              value={name}
              autoComplete="organization"
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "register-name-error" : undefined}
              data-auth-field="name"
              data-testid="register-name"
            />
            {errors.name && (
              <span className="field-error" id="register-name-error" data-testid="register-name-error">
                {errors.name}
              </span>
            )}
          </label>
          <label className="field" htmlFor="register-slug">
            Workspace URL
            <input
              ref={slugRef}
              id="register-slug"
              placeholder="alpine-resort"
              value={slug}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby={errors.slug ? "register-slug-error" : "register-slug-hint"}
              data-auth-field="slug"
              data-testid="register-slug"
            />
            <span className="field-hint" id="register-slug-hint">
              Lowercase letters, numbers and dashes. Max 40 characters.
            </span>
            <span className="auth-slug-preview" data-testid="register-slug-preview">
              /widget/{slug.trim() || "your-workspace"}/camera
            </span>
            {errors.slug && (
              <span className="field-error" id="register-slug-error" data-testid="register-slug-error">
                {errors.slug}
              </span>
            )}
          </label>
        </fieldset>
        <fieldset className="auth-section">
          <legend>Account</legend>
          <label className="field" htmlFor="register-email">
            Email
            <input
              ref={emailRef}
              id="register-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "register-email-error" : undefined}
              data-auth-field="email"
              data-testid="register-email"
            />
            {errors.email && (
              <span className="field-error" id="register-email-error" data-testid="register-email-error">
                {errors.email}
              </span>
            )}
          </label>
          <PasswordField
            id="register-password"
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChange={setPassword}
            testId="register-password"
            toggleTestId="register-password-toggle"
            autoComplete="new-password"
            error={errors.password}
            errorTestId="register-password-error"
            inputRef={passwordRef}
            fieldName="password"
          />
          <span className={`auth-rule${password.length >= 8 ? " is-met" : ""}`} data-testid="password-rule">
            At least 8 characters
          </span>
          <PasswordField
            id="register-password-confirm"
            label="Confirm password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={setConfirm}
            testId="register-password-confirm"
            toggleTestId="register-password-confirm-toggle"
            autoComplete="new-password"
            error={errors.confirm}
            errorTestId="register-password-confirm-error"
            inputRef={confirmRef}
            fieldName="confirm"
          />
        </fieldset>
        {formError && (
          <p className="auth-alert" data-testid="register-error" role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="auth-submit" disabled={submitting} data-testid="register-submit">
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account?{" "}
        <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
          Sign in
        </button>
      </p>
    </AuthShell>
  );
}
