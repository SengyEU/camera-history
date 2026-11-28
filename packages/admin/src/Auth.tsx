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
            Need help? <a href="mailto:support@camera-history.com">support@camera-history.com</a>
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
      return {
        field: "password",
        message: "Use 8 to 128 characters, one uppercase letter and one number.",
      };
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
  onForgot,
  notice,
}: {
  onSuccess: (email: string) => void;
  onRegister: () => void;
  onForgot: () => void;
  notice?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const resend = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed) || resendState === "sending") return;
    setResendState("sending");
    try {
      await api.resendVerification(trimmed);
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

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
    setUnverified(false);
    setResendState("idle");
    if (firstInvalidField(next)) {
      focusField(firstInvalidField(next));
      return;
    }
    setSubmitting(true);
    try {
      await api.login(trimmed, password);
      onSuccess(trimmed);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes("verif")) {
        setUnverified(true);
      } else {
        setFormError(loginError(err));
      }
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
        <p className="auth-field-row">
          <button type="button" className="link" onClick={onForgot} data-testid="goto-forgot">
            Forgot password?
          </button>
        </p>
        {formError && (
          <p className="auth-alert" data-testid="login-error" role="alert">
            {formError}
          </p>
        )}
        {unverified && (
          <div className="auth-alert auth-alert-info" data-testid="login-unverified" role="status">
            <p>Verify your email before signing in. We sent you a link when you created the account.</p>
            <button
              type="button"
              className="link"
              onClick={() => void resend()}
              disabled={resendState === "sending"}
              data-testid="login-resend"
            >
              {resendState === "sending"
                ? "Sending…"
                : resendState === "sent"
                  ? "Send again"
                  : "Resend verification email"}
            </button>
            {resendState === "sent" && <p data-testid="login-resend-status">Email sent.</p>}
            {resendState === "error" && (
              <p data-testid="login-resend-error">We couldn’t send the email. Try again in a moment.</p>
            )}
          </div>
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
  onRegistered,
  onSignedIn,
  onSignIn,
}: {
  onRegistered: (email: string, emailSent: boolean) => void;
  onSignedIn: (email: string) => void;
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
  const pilotCode = params.get("invite") ?? params.get("pilot") ?? undefined;
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
    else if (
      password.length < 8 ||
      password.length > 128 ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      next.password = "Use 8 to 128 characters, one uppercase letter and one number.";
    }
    if (!confirm) next.confirm = "Repeat your password.";
    else if (confirm !== password) next.confirm = "Passwords don’t match.";
    setErrors(next);
    setFormError(null);
    if (firstInvalidField(next)) return;
    setSubmitting(true);
    try {
      const result = await api.register({
        name: trimmedName,
        slug: trimmedSlug,
        email: trimmedEmail,
        password,
        pilotCode,
        packageCode,
      });
      if (result.status === "created") {
        window.location.hash = "";
        onSignedIn(trimmedEmail);
      } else {
        window.location.hash = "#/check-email";
        onRegistered(trimmedEmail, result.emailSent !== false);
      }
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
          Early access — 3 months free.
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
              Generated from the company name. You can edit it — lowercase letters, numbers and
              dashes, max 40 characters.
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
            placeholder="Your password"
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
          <div className="auth-rules" data-testid="password-rules">
            <span className={`auth-rule${password.length >= 8 ? " is-met" : ""}`}>
              At least 8 characters
            </span>
            <span className={`auth-rule${/[A-Z]/.test(password) ? " is-met" : ""}`}>
              One uppercase letter
            </span>
            <span className={`auth-rule${/\d/.test(password) ? " is-met" : ""}`}>One number</span>
          </div>
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

export function CheckEmail({
  email,
  emailSent,
  onSignIn,
}: {
  email: string;
  emailSent: boolean;
  onSignIn: () => void;
}) {
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const resend = async () => {
    if (resendState === "sending") return;
    setResendState("sending");
    try {
      await api.resendVerification(email);
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  return (
    <AuthShell>
      <div className="auth-head" data-testid="check-email">
        <span className="ts-chip">VERIFY EMAIL</span>
        <h1>Check your email</h1>
        <p>
          We sent a verification link to <strong>{email}</strong>. Open it to activate your
          workspace, then sign in.
        </p>
      </div>
      {!emailSent && (
        <p className="auth-alert" role="alert" data-testid="check-email-warning">
          Your account was created, but we couldn’t send the email. Try resending it below, or write
          to support@camera-history.com.
        </p>
      )}
      {resendState === "sent" && (
        <p className="auth-note" role="status" data-testid="resend-status">
          Email sent. It can take a minute to arrive.
        </p>
      )}
      {resendState === "error" && (
        <p className="auth-alert" role="alert" data-testid="resend-error">
          We couldn’t send the email. Try again, or write to support@camera-history.com.
        </p>
      )}
      <button
        type="button"
        className="auth-submit"
        onClick={() => void resend()}
        disabled={resendState === "sending"}
        data-testid="resend-verification"
      >
        {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Send again" : "Resend email"}
      </button>
      <p className="auth-switch">
        Already verified?{" "}
        <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
          Sign in
        </button>
      </p>
    </AuthShell>
  );
}

type VerifyResult = { status: string; email: string };
const verifyRequests = new Map<string, Promise<VerifyResult>>();

function verifyOnce(token: string): Promise<VerifyResult> {
  let request = verifyRequests.get(token);
  if (!request) {
    request = api.verifyEmail(token).catch((err: unknown) => {
      verifyRequests.delete(token);
      throw err;
    });
    verifyRequests.set(token, request);
  }
  return request;
}

export function VerifyEmail({ token, onSignIn }: { token: string; onSignIn: () => void }) {
  const [state, setState] = useState<"verifying" | "success" | "error">(token ? "verifying" : "error");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyOnce(token)
      .then((result) => {
        if (!active) return;
        setVerifiedEmail(result.email);
        setState("success");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [token]);

  const resend = async (event: FormEvent) => {
    event.preventDefault();
    if (resending) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError("Enter the email you registered with.");
      return;
    }
    setEmailError(null);
    setResendMessage(null);
    setResendError(null);
    setResending(true);
    try {
      await api.resendVerification(trimmed);
      setResendMessage("If that address has an unverified account, a new link is on its way.");
    } catch {
      setResendError("We couldn’t request a new link. Try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  if (state === "verifying") {
    return (
      <AuthShell>
        <div className="auth-head" role="status" aria-live="polite" data-testid="verify-loading">
          <span className="ts-chip">VERIFY EMAIL</span>
          <h1>Verifying your email…</h1>
          <p>One moment while we activate your workspace.</p>
        </div>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell>
        <div className="auth-head" data-testid="verify-success">
          <span className="ts-chip">EMAIL VERIFIED</span>
          <h1>You’re all set</h1>
          <p>
            {verifiedEmail ? <strong>{verifiedEmail}</strong> : "Your email"} is verified. Sign in to
            open your workspace.
          </p>
        </div>
        <button type="button" className="auth-submit" onClick={onSignIn} data-testid="verify-signin">
          Sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-head" data-testid="verify-error">
        <span className="ts-chip">VERIFY EMAIL</span>
        <h1>This link didn’t work</h1>
        <p>
          Verification links expire after 24 hours and can only be used once. Enter your email and
          we’ll send a new one.
        </p>
      </div>
      <form className="auth-form" noValidate onSubmit={resend} data-testid="verify-resend-form">
        <label className="field" htmlFor="verify-email">
          Email
          <input
            id="verify-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "verify-email-error" : undefined}
            data-testid="verify-resend-email"
          />
          {emailError && (
            <span className="field-error" id="verify-email-error" data-testid="verify-resend-error">
              {emailError}
            </span>
          )}
        </label>
        {resendMessage && (
          <p className="auth-note" role="status" data-testid="verify-resend-message">
            {resendMessage}
          </p>
        )}
        {resendError && (
          <p className="auth-alert" role="alert" data-testid="verify-resend-failure">
            {resendError}
          </p>
        )}
        <button type="submit" className="auth-submit" disabled={resending} data-testid="verify-resend-submit">
          {resending ? "Sending…" : "Send a new link"}
        </button>
      </form>
      <p className="auth-switch">
        <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
          Back to sign in
        </button>
      </p>
    </AuthShell>
  );
}

export function ForgotPassword({ onSignIn }: { onSignIn: () => void }) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError("Enter the email you registered with.");
      return;
    }
    setEmailError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await api.forgotPassword(trimmed);
      setSent(true);
    } catch {
      setFormError("We couldn’t send the email. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div className="auth-head" data-testid="forgot-sent">
          <span className="ts-chip">RESET PASSWORD</span>
          <h1>Check your email</h1>
          <p>
            If an account exists for <strong>{email.trim()}</strong>, we sent a reset link. It
            expires in 60 minutes and can be used once.
          </p>
        </div>
        <p className="auth-note">
          Didn’t get it? Check spam, or try again in a few minutes. You can also write to
          support@camera-history.com.
        </p>
        <button type="button" className="auth-submit" onClick={onSignIn} data-testid="forgot-signin">
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-head">
        <span className="ts-chip">RESET PASSWORD</span>
        <h1>Forgot your password?</h1>
        <p>Enter your email and we’ll send you a link to choose a new one.</p>
      </div>
      <form className="auth-form" noValidate onSubmit={submit} data-testid="forgot-form">
        <label className="field" htmlFor="forgot-email">
          Email
          <input
            id="forgot-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "forgot-email-error" : undefined}
            data-testid="forgot-email"
          />
          {emailError && (
            <span className="field-error" id="forgot-email-error" data-testid="forgot-email-error">
              {emailError}
            </span>
          )}
        </label>
        {formError && (
          <p className="auth-alert" role="alert" data-testid="forgot-error">
            {formError}
          </p>
        )}
        <button type="submit" className="auth-submit" disabled={submitting} data-testid="forgot-submit">
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="auth-switch">
        <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
          Back to sign in
        </button>
      </p>
    </AuthShell>
  );
}

function newPasswordProblem(password: string): string | null {
  if (password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Use 8 to 128 characters, one uppercase letter and one number.";
  }
  return null;
}

export function ResetPassword({
  token,
  onSignIn,
  onForgot,
}: {
  token: string;
  onSignIn: () => void;
  onForgot: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !token) return;
    const next: FieldErrors = {};
    const passwordError = newPasswordProblem(password);
    if (!password) next.password = "Create a new password.";
    else if (passwordError) next.password = passwordError;
    if (!confirm) next.confirm = "Repeat your new password.";
    else if (confirm !== password) next.confirm = "Passwords don’t match.";
    setErrors(next);
    setFormError(null);
    if (firstInvalidField(next)) {
      const ref = next.password ? passwordRef : confirmRef;
      window.setTimeout(() => ref.current?.focus(), 0);
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        setFormError("This reset link is invalid or has expired. Request a new one.");
      } else {
        setFormError(err instanceof ApiError ? err.message : NETWORK_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="auth-head" data-testid="reset-done">
          <span className="ts-chip">PASSWORD UPDATED</span>
          <h1>Password updated</h1>
          <p>Sign in with your new password to open your workspace.</p>
        </div>
        <button type="button" className="auth-submit" onClick={onSignIn} data-testid="reset-signin">
          Sign in
        </button>
      </AuthShell>
    );
  }

  if (!token) {
    return (
      <AuthShell>
        <div className="auth-head" data-testid="reset-error">
          <span className="ts-chip">RESET PASSWORD</span>
          <h1>This link didn’t work</h1>
          <p>Reset links expire after 60 minutes and can only be used once. Request a new one.</p>
        </div>
        <button type="button" className="auth-submit" onClick={onForgot} data-testid="reset-request-new">
          Request a new link
        </button>
        <p className="auth-switch">
          <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
            Back to sign in
          </button>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="auth-head">
        <span className="ts-chip">RESET PASSWORD</span>
        <h1>Choose a new password</h1>
        <p>Use 8 to 128 characters, one uppercase letter and one number.</p>
      </div>
      <form className="auth-form" noValidate onSubmit={submit} data-testid="reset-form">
        <PasswordField
          id="reset-password"
          label="New password"
          placeholder="Your new password"
          value={password}
          onChange={setPassword}
          testId="reset-password"
          toggleTestId="reset-password-toggle"
          autoComplete="new-password"
          error={errors.password}
          errorTestId="reset-password-error"
          inputRef={passwordRef}
          fieldName="new-password"
        />
        <PasswordField
          id="reset-password-confirm"
          label="Confirm new password"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={setConfirm}
          testId="reset-password-confirm"
          toggleTestId="reset-password-confirm-toggle"
          autoComplete="new-password"
          error={errors.confirm}
          errorTestId="reset-password-confirm-error"
          inputRef={confirmRef}
          fieldName="new-password-confirm"
        />
        {formError && (
          <p className="auth-alert" role="alert" data-testid="reset-error">
            {formError}{" "}
            <button type="button" className="link" onClick={onForgot} data-testid="reset-request-new">
              Request a new link
            </button>
          </p>
        )}
        <button type="submit" className="auth-submit" disabled={submitting} data-testid="reset-submit">
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
      <p className="auth-switch">
        <button type="button" className="link" onClick={onSignIn} data-testid="goto-signin">
          Back to sign in
        </button>
      </p>
    </AuthShell>
  );
}
