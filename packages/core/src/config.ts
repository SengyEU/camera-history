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
  worker: z.object({
    tickMs: numeric(60000),
    retryBackoffMs: numeric(30000),
    concurrency: numeric(2),
  }),
  feed: z.object({
    timeoutMs: numeric(15000),
    maxBytes: numeric(5242880),
  }),
  plan: z.object({
    defaultRetentionMonths: numeric(12),
    maxRetentionMonths: numeric(36),
  }),
});

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
    worker: {
      tickMs: env.WORKER_TICK_MS,
      retryBackoffMs: env.WORKER_RETRY_BACKOFF_MS,
      concurrency: env.WORKER_CONCURRENCY,
    },
    feed: { timeoutMs: env.FEED_TIMEOUT_MS, maxBytes: env.FEED_MAX_BYTES },
    plan: {
      defaultRetentionMonths: env.PLAN_DEFAULT_RETENTION_MONTHS,
      maxRetentionMonths: env.PLAN_MAX_RETENTION_MONTHS,
    },
  });
}