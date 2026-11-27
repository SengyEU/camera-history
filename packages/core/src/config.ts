import { z } from "zod";

const numeric = (defaultValue: number) =>
  z.coerce.number().default(defaultValue).pipe(z.number().finite());

// z.coerce.boolean by ze stringu "false" udelal true (Boolean("false") === true)
const boolean = (defaultValue: boolean) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return defaultValue;
      if (typeof value === "boolean") return value;
      const text = String(value).trim().toLowerCase();
      if (text === "") return defaultValue;
      if (["1", "true", "yes", "on"].includes(text)) return true;
      if (["0", "false", "no", "off"].includes(text)) return false;
      return value;
    },
    z.boolean(),
  );

const AppConfigSchema = z.object({
  databaseUrl: z.string().url().default("postgres://camera:camera@127.0.0.1:5432/camera_history"),
  minio: z.object({
    endpoint: z.string().default("127.0.0.1"),
    port: numeric(9000),
    useSsl: boolean(false),
    accessKey: z.string().min(1).default("minioadmin"),
    secretKey: z.string().min(1).default("minioadmin"),
    bucket: z.string().min(1).default("org"),
  }),
  jwt: z.object({
    secret: z.string().min(16).default("dev-secret-change-me"),
    accessTtlSeconds: numeric(900),
    refreshTtlSeconds: numeric(604800),
  }),
  api: z.object({
    port: numeric(3000),
    publicBaseUrl: z.string().default("http://localhost:8080"),
  }),
  mail: z.object({
    host: z.string().default(""),
    port: numeric(465),
    secure: boolean(true),
    user: z.string().default(""),
    pass: z.string().default(""),
    from: z.string().default("Camera History <noreply@camera-history.com>"),
    contactTo: z.string().default("marek@camera-history.com"),
  }),
  auth: z.object({
    requireEmailVerification: boolean(true),
    verificationTtlHours: numeric(24),
    passwordResetTtlMinutes: numeric(60),
  }),
  worker: z.object({
    tickMs: numeric(60000),
    retryBackoffMs: numeric(30000),
    concurrency: numeric(2),
  }),
  feed: z.object({
    timeoutMs: numeric(15000),
    maxBytes: numeric(5242880),
  }),
  stripe: z.object({
    enabled: boolean(false),
    secretKey: z.string().default(""),
    webhookSecret: z.string().default(""),
    portalConfigId: z.string().default(""),
    prices: z.record(z.string(), z.string()).default({}),
  }),
  billing: z.object({
    graceDays: numeric(7),
  }),
  pilot: z.object({
    inviteCode: z.string().default(""),
    durationDays: numeric(90),
  }),
});

const PACKAGE_PRICE_ENV_KEYS: Record<string, string> = {
  solo: "STRIPE_PRICE_SOLO",
  starter: "STRIPE_PRICE_STARTER",
  plus: "STRIPE_PRICE_PLUS",
  pro: "STRIPE_PRICE_PRO",
  network: "STRIPE_PRICE_NETWORK",
};

function pricesFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [code, key] of Object.entries(PACKAGE_PRICE_ENV_KEYS)) {
    const value = env[key];
    if (typeof value === "string" && value !== "") out[code] = value;
  }
  return out;
}

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return AppConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
    minio: {
      endpoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSsl: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucket: env.MINIO_BUCKET,
    },
    jwt: {
      secret: env.JWT_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    },
    api: { port: env.API_PORT, publicBaseUrl: env.PUBLIC_BASE_URL },
    mail: {
      host: env.SMTP_HOST ?? "",
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER ?? "",
      pass: env.SMTP_PASS ?? "",
      from: env.SMTP_FROM ?? "Camera History <noreply@camera-history.com>",
      contactTo: env.CONTACT_TO ?? "marek@camera-history.com",
    },
    auth: {
      requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      verificationTtlHours: env.AUTH_VERIFICATION_TTL_HOURS,
      passwordResetTtlMinutes: env.AUTH_PASSWORD_RESET_TTL_MINUTES,
    },
    worker: {
      tickMs: env.WORKER_TICK_MS,
      retryBackoffMs: env.WORKER_RETRY_BACKOFF_MS,
      concurrency: env.WORKER_CONCURRENCY,
    },
    feed: { timeoutMs: env.FEED_TIMEOUT_MS, maxBytes: env.FEED_MAX_BYTES },
    stripe: {
      enabled: env.STRIPE_ENABLED,
      secretKey: env.STRIPE_SECRET_KEY ?? "",
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
      portalConfigId: env.STRIPE_PORTAL_CONFIG_ID ?? "",
      prices: pricesFromEnv(env),
    },
    billing: { graceDays: env.BILLING_GRACE_DAYS },
    pilot: {
      inviteCode: env.PILOT_INVITE_CODE ?? "",
      durationDays: env.PILOT_DURATION_DAYS,
    },
  });
}